#!/usr/bin/env node
/**
 * Generate a reviewed, append-only catalogue import. This program never connects
 * to a database, executes SQL, rewrites a manifest, or changes supplied artwork.
 */
import { open, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const IMAGE = /^cards\/[a-z0-9][a-z0-9._-]*\.(jpg|jpeg|png|webp)$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MANIFEST_LIMIT = 1024 * 1024;
const ASSET_LIMIT = 32 * 1024 * 1024;

function assert(condition, message) { if (!condition) throw new Error(message); }

export function validateManifest(value) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'The catalogue must be a JSON object.');
  assert(typeof value.deckVersion === 'string' && SLUG.test(value.deckVersion), 'deckVersion must be a lowercase stable slug (maximum 80 characters).');
  assert(Array.isArray(value.cards) && value.cards.length >= 3 && value.cards.length <= 1000, 'The complete catalogue must contain between 3 and 1000 cards.');
  const ids = new Set(); const slugs = new Set(); const names = new Set(); const images = new Set();
  const cards = value.cards.map((card, index) => {
    const label = 'Card ' + (index + 1);
    assert(card && typeof card === 'object' && !Array.isArray(card), label + ' must be an object.');
    assert(Number.isSafeInteger(card.id) && card.id >= 1 && card.id <= 1000, label + ': id must be an integer between 1 and 1000.');
    assert(card.ordinal === card.id, label + ': ordinal must equal the stable ID; do not renumber cards.');
    assert(!ids.has(card.id), label + ': duplicate ID ' + card.id + '.'); ids.add(card.id);
    assert(typeof card.slug === 'string' && SLUG.test(card.slug) && !slugs.has(card.slug), label + ': slug must be valid and unique.'); slugs.add(card.slug);
    assert(typeof card.name === 'string' && card.name.trim() === card.name && card.name.length >= 1 && card.name.length <= 80 && !CONTROL.test(card.name), label + ': name must contain 1–80 printable characters without surrounding whitespace.');
    const foldedName = card.name.normalize('NFC').toLowerCase();
    assert(!names.has(foldedName), label + ': duplicate card name.'); names.add(foldedName);
    assert(typeof card.image === 'string' && card.image.length <= 240 && IMAGE.test(card.image) && !images.has(card.image), label + ': image must be a unique local cards/*.jpg, jpeg, png or webp path.'); images.add(card.image);
    assert(typeof card.alt === 'string' && card.alt.trim().length > 0 && card.alt.length <= 1000 && !CONTROL.test(card.alt), label + ': a printable, nonempty alt description is required.');
    return Object.freeze({
      id: card.id, slug: card.slug, name: card.name, image: card.image,
      alt: card.alt, ordinal: card.ordinal,
    });
  }).sort((a,b) => a.id - b.id);
  return Object.freeze({ deckVersion: value.deckVersion, cards: Object.freeze(cards) });
}

export async function loadCatalogue({
  manifestPath = resolve(REPO, 'catalog/impersonae-v1.json'),
  publicDir = resolve(REPO, 'public'),
} = {}) {
  const handle = await open(manifestPath, 'r');
  let raw;
  try {
    assert((await handle.stat()).size <= MANIFEST_LIMIT, 'The catalogue JSON exceeds 1 MiB.');
    raw = await handle.readFile({ encoding: 'utf8' });
  } finally { await handle.close(); }
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('The catalogue contains invalid JSON.'); }
  const catalogue = validateManifest(value);
  const root = await realpath(publicDir);
  // Read only file signatures; do not decode, crop, recompress or write any art.
  for (const card of catalogue.cards) {
    let path;
    try { path = await realpath(resolve(root, card.image)); }
    catch { throw new Error('Missing artwork: public/' + card.image); }
    const within = relative(root, path);
    assert(within !== '' && !isAbsolute(within) && within !== '..' && !within.startsWith('..' + sep), 'Artwork must stay inside public/: ' + card.image);
    const file = await open(path, 'r');
    try {
      const stat = await file.stat();
      assert(stat.isFile() && stat.size >= 12 && stat.size <= ASSET_LIMIT, 'Artwork must be a nonempty regular image of at most 32 MiB: ' + card.image);
      const header = Buffer.alloc(12); await file.read(header, 0, 12, 0);
      const extension = IMAGE.exec(card.image)[1];
      const valid = extension === 'png' ? header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        : extension === 'webp' ? header.toString('ascii',0,4) === 'RIFF' && header.toString('ascii',8,12) === 'WEBP'
        : header[0] === 255 && header[1] === 216 && header[2] === 255;
      assert(valid, 'The artwork signature does not match its extension: ' + card.image);
    } finally { await file.close(); }
  }
  return catalogue;
}

function literal(value) {
  // E-strings explicitly escape both slashes and quotes, regardless of server defaults.
  return "E'" + value.replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

/**
 * This SQL is applied manually to an existing draft event. It performs only
 * append-only inserts in cards/event_cards, with guards before and after them.
 */
export function generateSql(input, eventSlug = 'big-2026') {
  const catalogue = validateManifest(input);
  assert(typeof eventSlug === 'string' && SLUG.test(eventSlug), '--event must be a valid lowercase event slug (maximum 80 characters).');
  const rows = catalogue.cards.map(({id,slug,name,image,ordinal}) => ({id,slug,name,image,ordinal}));
  const incoming = "jsonb_to_recordset(v_cards) AS i(id integer,slug text,name text,image text,ordinal integer)";
  const mismatch = [
    "    SELECT 1 FROM " + incoming,
    "    JOIN big_match.cards c ON c.deck_version=v_deck AND (c.id=i.id OR c.slug=i.slug)",
    "    WHERE c.id IS DISTINCT FROM i.id OR c.slug IS DISTINCT FROM i.slug",
    "       OR c.name IS DISTINCT FROM i.name OR c.image IS DISTINCT FROM i.image",
    "       OR c.ordinal IS DISTINCT FROM i.ordinal",
  ].join('\n');
  const body = [
    "DECLARE",
    "  v_slug text := " + literal(eventSlug) + ";",
    "  v_deck text := " + literal(catalogue.deckVersion) + ";",
    "  v_cards jsonb := " + literal(JSON.stringify(rows)) + "::jsonb;",
    "  v_event big_match.events;",
    "  v_max_id integer;",
    "BEGIN",
    "  SELECT * INTO v_event FROM big_match.events WHERE slug=v_slug FOR UPDATE;",
    "  IF NOT FOUND THEN",
    "    RAISE EXCEPTION 'BM_CATALOG_EVENT_MISSING' USING HINT='Create the target draft event with its dates and deck version first. This import does not create or open events.';",
    "  END IF;",
    "  IF v_event.status <> 'draft' OR v_event.archived_at IS NOT NULL THEN",
    "    RAISE EXCEPTION 'BM_CATALOG_EVENT_FROZEN' USING HINT='Choose a future draft event with --event. Never revert a published event to draft, disable its constraints, or delete its responses.';",
    "  END IF;",
    "  IF v_event.deck_version <> v_deck THEN",
    "    RAISE EXCEPTION 'BM_CATALOG_DECK_MISMATCH' USING HINT='The target event must use the manifest deck version. Existing events are never rewritten by this import.';",
    "  END IF;",
    "  -- Serialise this importer across draft events of the same deck.",
    "  PERFORM pg_advisory_xact_lock(hashtext('big-match-catalog:' || v_deck));",
    "  IF EXISTS (" + '\n' + mismatch + '\n' + "  ) THEN",
    "    RAISE EXCEPTION 'BM_CATALOG_IDENTITY_CONFLICT' USING HINT='Existing IDs, slugs, names, images and ordinals must match exactly. Restore the original record; never renumber or overwrite it.';",
    "  END IF;",
    "  IF EXISTS (",
    "    SELECT 1 FROM big_match.cards c WHERE c.deck_version=v_deck",
    "    AND NOT EXISTS(SELECT 1 FROM " + incoming + " WHERE i.id=c.id)",
    "  ) THEN",
    "    RAISE EXCEPTION 'BM_CATALOG_INCOMPLETE_MANIFEST' USING HINT='Use the complete latest catalogue, including existing cards. This import never removes cards or event membership.';",
    "  END IF;",
    "  SELECT COALESCE(max(id),0) INTO v_max_id FROM big_match.cards WHERE deck_version=v_deck;",
    "  IF EXISTS (",
    "    SELECT 1 FROM " + incoming,
    "    WHERE i.id <= v_max_id AND NOT EXISTS(",
    "      SELECT 1 FROM big_match.cards c WHERE c.deck_version=v_deck AND c.id=i.id",
    "    )",
    "  ) THEN",
    "    RAISE EXCEPTION 'BM_CATALOG_NOT_APPEND_ONLY' USING HINT='New IDs must be larger than every existing ID in this deck. Do not fill retired IDs or renumber cards.';",
    "  END IF;",
    "  INSERT INTO big_match.cards(deck_version,id,slug,name,image,ordinal)",
    "  SELECT v_deck,i.id,i.slug,i.name,i.image,i.ordinal FROM " + incoming,
    "  ON CONFLICT DO NOTHING;",
    "  -- Detect an out-of-band conflicting insert instead of silently accepting it.",
    "  IF EXISTS (" + '\n' + mismatch + '\n' + "  ) THEN",
    "    RAISE EXCEPTION 'BM_CATALOG_IDENTITY_CONFLICT' USING HINT='A conflicting card definition appeared. The whole import has been rolled back.';",
    "  END IF;",
    "  INSERT INTO big_match.event_cards(event_id,deck_version,card_id,enabled)",
    "  SELECT v_event.id,v_deck,i.id,true FROM " + incoming,
    "  ON CONFLICT(event_id,card_id) DO NOTHING;",
    "  -- Existing membership, including deliberately disabled cards, is preserved.",
    "END;",
  ].join('\n');
  // A name can contain a dollar-quote delimiter. Pick one absent from the body.
  let tag = '$big_match_catalog$'; let suffix = 0;
  while (body.includes(tag)) tag = '$big_match_catalog_' + (++suffix) + '$';
  return [
    '-- BIG MATCH catalogue import. Generated locally; no database connection was made.',
    '-- Event: ' + eventSlug + ' | Deck: ' + catalogue.deckVersion + ' | Cards: ' + rows.length,
    '-- Review before applying. Requires an EXISTING DRAFT event.',
    '-- Open/closed events are frozen: use --event with a future draft event instead.',
    '-- Append-only: no UPDATE, DELETE, TRUNCATE, event reopening or participation changes.',
    '-- Existing definitions must match. New IDs extend the deck; existing disabled membership stays disabled.',
    'BEGIN;',
    "SET LOCAL lock_timeout = '5s';",
    "SET LOCAL statement_timeout = '30s';",
    'DO ' + tag,
    body,
    tag + ';',
    'COMMIT;',
    '',
  ].join('\n');
}

const HELP = [
  'Usage: node scripts/catalog-sql.mjs [--event slug] [--output path]',
  '',
  'Validate catalog/impersonae-v1.json and its artwork, then generate SQL.',
  'Default: event big-2026, SQL to stdout. No database connection or execution.',
  '--event slug  Target an existing draft event. Published events are frozen.',
  '--output path Write a new SQL file; refuse to overwrite an existing file.',
  '--help        Show this help.',
  '',
  'For an open/closed event, create a future draft event through the documented',
  'backend setup and target it here. Never reopen, renumber, or delete responses.',
  '',
].join('\n');

export async function main(argv = process.argv.slice(2)) {
  let event = 'big-2026'; let output;
  if (argv.includes('--help') || argv.includes('-h')) { process.stdout.write(HELP); return; }
  const seen = new Set();
  for (let i=0; i<argv.length; i++) {
    const option = argv[i];
    assert(['--event','--output'].includes(option) && !seen.has(option), 'Unknown or repeated option: ' + option + '. Use --help.');
    seen.add(option);
    const value = argv[++i];
    assert(value && !value.startsWith('--'), 'Missing value for ' + option + '.');
    if (option === '--event') event = value; else output = value;
  }
  assert(SLUG.test(event), '--event must be a valid lowercase event slug.');
  const catalogue = await loadCatalogue();
  const sql = generateSql(catalogue,event);
  if (output) {
    await writeFile(resolve(process.cwd(),output),sql,{encoding:'utf8',flag:'wx'});
    process.stderr.write('SQL written to ' + output + '. Review it before applying to the draft event.\n');
  } else process.stdout.write(sql);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    process.stderr.write('Catalogue SQL was not generated: ' + error.message + '\n');
    process.exitCode = 1;
  });
}
