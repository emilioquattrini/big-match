import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { generateSql, loadCatalogue, validateManifest } from '../../scripts/catalog-sql.mjs';

const script = fileURLToPath(new URL('../../scripts/catalog-sql.mjs', import.meta.url));
const original = JSON.parse(await readFile(new URL('../../catalog/impersonae-v1.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(original);
const extra = (id = 14) => ({ id, ordinal: id, slug: 'future-' + id, name: 'Future ' + id, image: 'cards/future-' + id + '.jpg', alt: 'Original future artwork ' + id });
const count = async (db, table, where, values = []) => (await db.query('SELECT count(*)::int AS n FROM big_match.' + table + ' WHERE ' + where, values)).rows[0].n;

it('validates all original artwork without rewriting or renumbering the manifest', async () => {
  const catalogue = await loadCatalogue();
  assert.equal(catalogue.deckVersion, 'impersonae-v1');
  assert.equal(catalogue.cards.length, 13);
  assert.deepEqual(catalogue.cards.map(c => c.id), Array.from({ length: 13 }, (_, i) => i + 1));
  assert.equal(catalogue.cards[10].name, 'Otherthinker');
  const shuffled = clone(); shuffled.cards.reverse();
  assert.deepEqual(validateManifest(shuffled).cards, catalogue.cards);
  assert.equal(shuffled.cards[0].id, 13, 'validation does not mutate the source');
});

it('rejects malformed IDs, identity duplicates, unsafe paths and missing descriptions', () => {
  const bad = [
    c => { c.cards[0].id = 0; },
    c => { c.cards[0].id = 1.5; },
    c => { c.cards[0].ordinal = 2; },
    c => { c.cards[1] = structuredClone(c.cards[0]); },
    c => { c.cards[1].slug = c.cards[0].slug; },
    c => { c.cards[1].name = c.cards[0].name.toUpperCase(); },
    c => { c.cards[0].name = ' Cyborg'; },
    c => { c.cards[0].name = 'Bad\u0000name'; },
    c => { c.cards[0].image = 'cards/../../secret.jpg'; },
    c => { c.cards[0].image = 'https://example.com/card.jpg'; },
    c => { c.cards[0].alt = ''; },
    c => { c.deckVersion = 'invalid/version'; },
  ];
  for (const change of bad) { const c = clone(); change(c); assert.throws(() => validateManifest(c)); }
  assert.throws(() => generateSql(original, "x'; DROP TABLE cards;--"), /event/);
});

it('checks artwork signatures, missing files and symlink containment', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'big-match-catalog-'));
  try {
    const publicDir = join(dir, 'public'); await mkdir(join(publicDir, 'cards'), { recursive: true });
    const manifestPath = join(dir, 'catalog.json');
    const small = clone(); small.cards = small.cards.slice(0, 3);
    await writeFile(manifestPath, JSON.stringify(small));
    const jpeg = Buffer.from([255,216,255,224,0,0,0,0,0,0,0,0]);
    for (const card of small.cards) await writeFile(join(publicDir, card.image), jpeg);
    assert.equal((await loadCatalogue({manifestPath, publicDir})).cards.length, 3);
    await writeFile(join(publicDir, small.cards[0].image), Buffer.alloc(12));
    await assert.rejects(loadCatalogue({manifestPath, publicDir}), /signature/);
    await rm(join(publicDir, small.cards[0].image));
    await assert.rejects(loadCatalogue({manifestPath, publicDir}), /Missing artwork/);
    const outside = join(dir, 'outside.jpg'); await writeFile(outside, jpeg);
    await symlink(outside, join(publicDir, small.cards[0].image));
    await assert.rejects(loadCatalogue({manifestPath, publicDir}), /inside public/);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

it('CLI emits reviewable SQL, targets a slug and writes only a new requested file', async () => {
  const stdout = spawnSync(process.execPath, [script], {encoding: 'utf8'});
  assert.equal(stdout.status, 0, stdout.stderr);
  assert.match(stdout.stdout, /BEGIN;/); assert.match(stdout.stdout, /COMMIT;/);
  assert.match(stdout.stdout, /v_slug text := E'big-2026'/);
  const dir = await mkdtemp(join(tmpdir(), 'big-match-sql-'));
  try {
    const path = join(dir, 'import.sql');
    const written = spawnSync(process.execPath, [script, '--event', 'future-draft', '--output', path], {encoding: 'utf8'});
    assert.equal(written.status, 0, written.stderr); assert.equal(written.stdout, '');
    const saved = await readFile(path, 'utf8');
    assert.match(saved, /v_slug text := E'future-draft'/);
    const repeat = spawnSync(process.execPath, [script, '--output', path], {encoding: 'utf8'});
    assert.equal(repeat.status, 1); assert.equal(repeat.stdout, '');
    assert.equal(await readFile(path, 'utf8'), saved, 'does not overwrite a previous SQL file');
    for (const args of [['--event'], ['--event', 'Invalid Slug'], ['--event', 'a', '--event', 'b'], ['--unknown']]) {
      const invalid = spawnSync(process.execPath, [script, ...args], {encoding: 'utf8'});
      assert.equal(invalid.status, 1); assert.equal(invalid.stdout, '');
    }
  } finally { await rm(dir, {recursive: true, force: true}); }
});

describe('generated catalogue SQL on actual PostgreSQL', {concurrency: false}, () => {
  let db;
  before(async () => {
    db = new PGlite();
    await db.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, is_anonymous boolean NOT NULL DEFAULT true);');
    await db.exec(await readFile(new URL('../../supabase/migrations/202610060001_big_match.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../../supabase/seed.sql', import.meta.url), 'utf8'));
  });
  after(async () => { await db.close(); });
  async function draft(slug, deckVersion) {
    return (await db.query("INSERT INTO big_match.events(slug,title,question,deck_version,starts_at,ends_at) VALUES($1,'Test draft','Choose three',$2,now()-interval '1 day',now()+interval '1 day') RETURNING id", [slug, deckVersion])).rows[0].id;
  }
  async function rejectSql(sql, error) {
    try { await assert.rejects(db.exec(sql), error); }
    finally { await db.exec('ROLLBACK'); }
  }

  it('reapplies the seed and appends new stable cards without enabling disabled membership', async () => {
    await db.exec(generateSql(original));
    const id = (await db.query("SELECT id FROM big_match.events WHERE slug='big-2026'")).rows[0].id;
    await db.query('UPDATE big_match.event_cards SET enabled=false WHERE event_id=$1 AND card_id=13', [id]);
    const expanded = clone(); expanded.cards.push(extra());
    await db.exec(generateSql(expanded));
    await db.exec(generateSql(expanded));
    assert.equal(await count(db, 'cards', 'deck_version=$1', [original.deckVersion]), 14);
    assert.equal(await count(db, 'event_cards', 'event_id=$1', [id]), 14);
    assert.equal((await db.query('SELECT enabled FROM big_match.event_cards WHERE event_id=$1 AND card_id=13', [id])).rows[0].enabled, false);
    assert.equal(await count(db, 'participations', 'event_id=$1', [id]), 0);
    const originals = (await db.query('SELECT id,slug,name,image,ordinal FROM big_match.cards WHERE deck_version=$1 AND id<=13 ORDER BY id', [original.deckVersion])).rows;
    assert.deepEqual(originals, original.cards.map(({id,slug,name,image,ordinal}) => ({id,slug,name,image,ordinal})));
  });

  it('rejects definition changes, stale/incomplete manifests and invalid targets atomically', async () => {
    const expanded = clone(); expanded.cards.push(extra());
    const renamed = structuredClone(expanded); renamed.cards[0].name = 'Renamed'; renamed.cards.push(extra(15));
    await rejectSql(generateSql(renamed), /BM_CATALOG_IDENTITY_CONFLICT/);
    assert.equal(await count(db, 'cards', 'deck_version=$1 AND id=15', [original.deckVersion]), 0);
    await rejectSql(generateSql(original), /BM_CATALOG_INCOMPLETE_MANIFEST/);
    await rejectSql(generateSql(expanded, 'missing-event'), /BM_CATALOG_EVENT_MISSING/);
    await draft('wrong-deck', 'other-version');
    await rejectSql(generateSql(expanded, 'wrong-deck'), /BM_CATALOG_DECK_MISMATCH/);
    assert.equal(await count(db, 'cards', 'deck_version=$1', [original.deckVersion]), 14);
  });

  it('refuses to fill an earlier unused ID rather than silently reusing the stable numbering', async () => {
    const gap = clone(); gap.deckVersion = 'gap-test'; gap.cards = [gap.cards[0],gap.cards[1],gap.cards[3]];
    await draft('gap-draft', gap.deckVersion);
    await db.exec(generateSql(gap, 'gap-draft'));
    gap.cards.push(structuredClone(original.cards[2]));
    await rejectSql(generateSql(gap, 'gap-draft'), /BM_CATALOG_NOT_APPEND_ONLY/);
    assert.equal(await count(db, 'cards', 'deck_version=$1', [gap.deckVersion]), 3);
  });

  it('preserves published events and responses while allowing a future draft to gain new cards', async () => {
    const c = clone(); c.deckVersion = 'freeze-test';
    const id = await draft('published-test', c.deckVersion);
    await db.exec(generateSql(c, 'published-test'));
    await db.query("UPDATE big_match.events SET collection_ready=true,privacy_version='test-v1',privacy_notice='Test notice covering technical sessions, optional requests, deletion and limited retention.',controller_name='Test Controller',controller_email='test@example.invalid',status='open' WHERE id=$1", [id]);
    const actor = randomUUID(); await db.query('INSERT INTO auth.users(id) VALUES($1)', [actor]);
    await db.query("SELECT public.bm_put('published-test',$1,ARRAY[1,2,3],$2,0)", [actor, randomUUID()]);
    const before = (await db.query('SELECT * FROM big_match.participations WHERE event_id=$1', [id])).rows;
    c.cards.push(extra());
    await rejectSql(generateSql(c, 'published-test'), /BM_CATALOG_EVENT_FROZEN/);
    assert.equal(await count(db, 'cards', 'deck_version=$1', [c.deckVersion]), 13);
    await db.query("UPDATE big_match.events SET status='closed' WHERE id=$1", [id]);
    await rejectSql(generateSql(c, 'published-test'), /BM_CATALOG_EVENT_FROZEN/);
    const nextId = await draft('future-test', c.deckVersion);
    await db.exec(generateSql(c, 'future-test'));
    assert.equal(await count(db, 'event_cards', 'event_id=$1', [nextId]), 14);
    assert.equal(await count(db, 'event_cards', 'event_id=$1', [id]), 13);
    assert.deepEqual((await db.query('SELECT * FROM big_match.participations WHERE event_id=$1', [id])).rows, before);
    assert.equal((await db.query('SELECT status FROM big_match.events WHERE id=$1', [id])).rows[0].status, 'closed');
  });

  it('treats quotes, backslashes and dollar delimiters in card names as data', async () => {
    const c = clone(); c.deckVersion = 'escaping-test'; c.cards = c.cards.slice(0,3);
    const name = "O'Brien \\ $big_match_catalog$; SELECT 'x'";
    c.cards[2].name = name;
    await draft('escaping-draft', c.deckVersion);
    const sql = generateSql(c, 'escaping-draft');
    assert.match(sql, /DO \$big_match_catalog_1\$/);
    await db.exec(sql);
    assert.equal((await db.query('SELECT name FROM big_match.cards WHERE deck_version=$1 AND id=3', [c.deckVersion])).rows[0].name, name);
    assert.equal(await count(db, 'cards', 'deck_version=$1', [c.deckVersion]), 3);
  });
});
