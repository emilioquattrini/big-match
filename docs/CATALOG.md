# Impersonae catalogue, matching and Story export

## Artwork provenance

The first catalogue contains the **13 original Impersonae cards** embedded in the previous app, extracted from repository commit `f15e6aa53c266f1a793205245a4e92e8eda359c2` (the audited `main` snapshot).

Each original `data:image/jpeg;base64,...` value was base64-decoded directly to a JPEG file. The logo was decoded directly from its original PNG data URL. **No image was regenerated, recoloured, resized, cropped or recompressed.** In particular, the original name **Otherthinker** is retained.

The application imports `catalog/impersonae-v1.json`. Images are individual browser-cacheable assets under `public/`; paths in the catalogue are relative to the application base, so GitHub Pages deployments under `/big-match/` work.

| Stable ID / ordinal | Original name | App-relative image | Pixels | Bytes |
|---:|---|---|---:|---:|
| 1 | Cyborg | `cards/cyborg.jpg` | 433 × 640 | 16,049 |
| 2 | Diva | `cards/diva.jpg` | 435 × 640 | 15,679 |
| 3 | Exotic | `cards/exotic.jpg` | 432 × 640 | 15,634 |
| 4 | Hypnotic | `cards/hypnotic.jpg` | 436 × 640 | 10,776 |
| 5 | Juggler | `cards/juggler.jpg` | 435 × 640 | 14,996 |
| 6 | Loyal | `cards/loyal.jpg` | 436 × 640 | 14,436 |
| 7 | Mother | `cards/mother.jpg` | 434 × 640 | 10,212 |
| 8 | Nocturnal | `cards/nocturnal.jpg` | 435 × 640 | 14,283 |
| 9 | Nostalgia | `cards/nostalgia.jpg` | 434 × 640 | 11,831 |
| 10 | Oceanic | `cards/oceanic.jpg` | 434 × 640 | 15,789 |
| 11 | Otherthinker | `cards/otherthinker.jpg` | 435 × 640 | 20,018 |
| 12 | Chimera | `cards/chimera.jpg` | 435 × 640 | 19,878 |
| 13 | Emotional | `cards/emotional.jpg` | 435 × 640 | 24,294 |

The logo is `brand/impersonae.png`, 700 × 119 pixels, 29,586 bytes. It contains the original white Impersonae lettering and works on the existing pink `#F15C9A` header. The combined size of the 13 JPEGs and original PNG is **233,461 bytes**. A favicon or app icon may be a separately named derivative; do not overwrite the original logo.

The `alt` fields identify the named card and original artist. They do not invent an interpretation or assign personality traits to visitors.

## Stable IDs and future cards

The JSON schema is:

```json
{
  "deckVersion": "impersonae-v1",
  "cards": [
    {
      "id": 1,
      "slug": "cyborg",
      "name": "Cyborg",
      "image": "cards/cyborg.jpg",
      "alt": "Cyborg — original Impersonae card artwork by Chiara Zhu",
      "ordinal": 1
    }
  ]
}
```

To extend the catalogue:

1. Keep the existing IDs, slugs and image files stable. Do not reuse or renumber an ID. Use ID/ordinal 14 for the next original card, then 15, and so on.
2. Add the original image under `public/cards/` and append the record. `id` and `ordinal` intentionally agree in this catalogue.
3. Add the new ID to a **draft** server-side event only after clients can load its catalogue record and asset. An open or closed event keeps its published card membership; use a future draft event for an extension.
4. For a materially different deck, use a new explicit deck version and keep versioned result routes deliberate. A client with an incompatible deck must display unavailable content rather than substitute another image.
5. Retire a card from new submissions through `activeCardIds`; do not assign its ID to different artwork. Decisions about archived result compatibility should be handled explicitly when a version is retired.
6. Run the domain/catalogue tests and an actual browser export with the new art before release.

## Generate the database catalogue import

The manifest is the source for both the frontend and future database imports. After appending original artwork and records, run:

```bash
node scripts/catalog-sql.mjs --event big-2026 --output /tmp/big-match-catalog.sql
```

Omit `--output` to print SQL to stdout. `--event` defaults to `big-2026`; `--help` lists the options. The equivalent npm command is `npm run catalog:sql -- --event big-2026 --output /tmp/big-match-catalog.sql`. Output files must be new: the script refuses to overwrite an existing file.

This command reads `catalog/impersonae-v1.json` and checks stable IDs/ordinals, unique slugs/names/image paths, required descriptions, local asset containment and JPEG/PNG/WebP signatures. It never changes the manifest or artwork, connects to Supabase, or executes database commands. Review the generated SQL and apply it through the project's existing administrative database workflow.

The output contains an explicit `BEGIN`/`COMMIT` transaction with short lock and statement timeouts. It adds only missing global card definitions and target-event membership. Reapplying the same complete catalogue to a draft event is safe; deliberately disabled existing membership remains disabled. Existing IDs, slugs, names, image paths and ordinals must agree exactly with the database. New IDs must exceed the deck's highest recorded ID, and the manifest must retain every recorded card. An inconsistency aborts the whole transaction instead of partially importing an extension. No participation, contact or event settings are changed.

**The target event must already exist, use the manifest's deck version, and remain draft.** The import refuses an open, closed or archived event even when all card definitions already match. For a published event, configure a separate future draft event with its own slug, question, dates and privacy settings as described in [BACKEND.md](BACKEND.md), then generate with `--event future-event-slug`. Its new membership can include appended cards while the old event and responses stay intact. Do not reopen the old event, bypass freeze constraints, delete responses or recycle IDs to force an import.

The import leaves collection closed and contacts disabled when those are the event's current settings. After deploying compatible frontend assets, complete the event configuration and open collection through the documented backend setup. This generator does not open the event or create an administrator account.

Run its validation, CLI and PostgreSQL integration tests with:

```bash
node --test tests/backend/catalog-sql.test.mjs
```

## Combination identity

`src/domain.ts` treats a selection as an **unordered set of three distinct positive integer card IDs**. `canonicalTrio()` returns a fresh frozen sorted tuple, optionally checking the currently permitted ID set, without changing the caller's tap order.

The public combination key is deck-qualified, for example:

```text
impersonae-v1/1-2-3
```

The displayed number is a one-based combinadic rank. For sorted IDs `a < b < c`:

```text
number = C(a − 1, 1) + C(b − 1, 2) + C(c − 1, 3) + 1
```

Examples:

| Card IDs | Combination number |
|---|---:|
| 1, 2, 3 | 1 |
| 1, 2, 4 | 2 |
| 1, 3, 4 | 3 |
| 2, 3, 4 | 4 |
| 1, 2, 5 | 5 |

This produces 286 distinct numbers for the current 13 cards and 22,100 for a 52-card extension. Adding higher IDs does not change earlier numbers. Intermediate arithmetic uses `BigInt`; a result beyond JavaScript's safe integer range throws instead of rounding into a collision. Formatting may use `String(number).padStart(4, '0')`; do not truncate larger codes.

**A combination number describes cards, not a unique person or a saved participation.** The backend's `participationId` and revision identify a persisted contribution. The exported poster can be created locally even when the community service is unavailable; that must not imply its contribution was saved.

## Matching semantics

The pure functions `computeMatches()` and `computeMind()` provide reference behaviour for actual recorded rows. They are not a replacement for the backend's coherent aggregate query.

- Exact: another participant selected the same three cards.
- Close: another participant selected exactly two of the three cards.
- The current participant is excluded by record ID. Each other participant is counted once; an exact match is not also a close match.
- Duplicate participant IDs or invalid triples cause an error rather than inflated totals.
- When the requested owner is absent, `computeMatches()` returns zero counts; the UI must still distinguish an unsaved/local result from a confirmed personal result.
- `computeMind()` exposes only total, card counts, sorted pair counts, version and timestamp. It deliberately returns no participant IDs.

The required dataset `ABC, ABC, ABD, ACD, BCD, AEF, DEF`, taking the first ABC as owner, returns **exact 1, close 3**.

`computeMind(rows, version, asOf)` accepts an explicit coherent snapshot version and time. Its default epoch timestamp makes it deterministic as a test oracle. **Do not use the default epoch as a live API timestamp or present its output over made-up rows as community activity.**

## Read-only result routes

```text
#/r/big-2026/impersonae-v1/1-2-3
```

`buildResultHash()` creates a canonical route. `parseResultHash(hash, validIds, expectedEvent, expectedDeck)` accepts only that exact representation with the expected event/deck and known permitted IDs. It rejects permutations, duplicates, leading zeroes, unknown cards, encoded path fragments, extra query/fragment/path data, unsafe integers and trailing whitespace.

The parser only returns the three IDs. **Reading a shared result must never create or update a participation.** A visitor chooses to participate through the separate selection/save flow. Shared views do not have access to another visitor's identity or personal match counts.

## Independent 1080 × 1920 Story renderer

`src/poster.ts` exports:

```ts
renderPoster(cards, {
  code: 'BIG MATCH #0001',
  question: 'What does the future of design look like?',
  logoUrl: 'brand/impersonae.png',
  baseUrl: 'https://example.com/big-match/',
  assetBaseUrl: 'http://localhost:5173/big-match/' // Optional preview serving root
}): Promise<Blob>
```

The renderer owns one detached canvas per invocation and requests PNG encoding at exactly `POSTER_WIDTH = 1080`, `POSTER_HEIGHT = 1920`. It has no native-share, download, clipboard, storage or live-DOM side effects. The caller should pass an immutable completed result, cache its blob and own the single share/download operation.

The design preserves the original pink/cream palette, original logo, three original card images, large “YOUR BIG MATCH.” heading, names and artist/event credit. The card artwork is fitted using its actual dimensions with **no cropping or distortion**. The completed poster omits simulated community counts.

The renderer waits for the locally bundled **Outfit Variable** font and uses Arial/sans-serif if font loading fails. Image errors, unreadable images, unavailable canvas or failed PNG encoding reject the promise; the UI must surface the failure and allow retry instead of claiming an export exists. Images have a bounded 15-second load timeout.

`baseUrl` is the canonical public root printed in the poster. Query strings, hashes and credentials are not printed; credential-bearing URLs are rejected. `assetBaseUrl` lets preview builds load local assets even when `baseUrl` points to a public deployment. App-relative `cards/*.jpg`, `jpeg`, `png` or `webp` assets are accepted; arbitrary card URLs and traversal paths are rejected.

The visible URL is the public participation entry point. The separate share action may include the precise read-only result route. No QR code is drawn or implied by this renderer.

## Verification

Run:

```bash
node --test tests/domain.test.ts tests/poster.test.ts
```

Domain tests exhaust all 286 current triples and 22,100 triples for 52 cards, verify strict route rejection and the required matching dataset, and check catalogue/asset availability.

Poster unit tests use an explicit canvas/image API fixture. They verify fixed geometry, uncropped source proportions, separate canvases for concurrent results, preview/canonical URL separation, input rejection and failure behaviour. **They do not assert native PNG pixel encoding.** The browser/e2e release gate must also export a real file, inspect its 1080 × 1920 PNG dimensions and review artwork/font rendering on the supported desktop and mobile browsers.

## Original binary fingerprints

These hashes identify the exact decoded source assets from the audited commit:

```text
9aec72ed5f6badaab6ce7dd68d483fe02c31fa39179f6a0b6428b8475c7913f6  public/cards/cyborg.jpg
6f0e5a20b760e6cdeccc269a65fc58b2de95bde6db7c137e43feb41a02401219  public/cards/diva.jpg
2b26a0f73ffab0c6ec86255f9336cacf225c4672d2b666dd4b17770fcac53b5c  public/cards/exotic.jpg
aa90f80a1e56025c1ce7e9f7fc55f1a5dc86470227523d069099826c1d33974f  public/cards/hypnotic.jpg
84482156e57d2bd8d4afaa21859d43211cb34349d88b9190bc72682b2316fb06  public/cards/juggler.jpg
5d0431f745c08816a20ff5e6abf2310e838cd29312647b1a918afb73ee59d2b8  public/cards/loyal.jpg
c48292d8c5c23be65550dcf94ccfe2fa4840eb69a087aa3331158775554f4fc7  public/cards/mother.jpg
c989d7bd2c7c605ff979f1af615232baaa1bebf14d8c90619074723cd93c0e5b  public/cards/nocturnal.jpg
b8973b1eb7ef30f4e3f7c5e376d970519105a61ab00ce4a8329b79b3f001e2d0  public/cards/nostalgia.jpg
ccc9f7f1398e17e5689320afe6241256544316bf8b02bbf31058b8bc791447fa  public/cards/oceanic.jpg
d3758455d64cd586a91d2a5fd1aee8d62a4dc5a6eea7a60fc648c93af4f8c858  public/cards/otherthinker.jpg
e2e5b95eb679fcd897ffdbf22d29d803f9ef21a8a482aaeb0467ac3efad33e90  public/cards/chimera.jpg
2490fa124bb0c4bfc143054da32ba817a9e2cdd4f4036c09360af365abc4e4a7  public/cards/emotional.jpg
22b320056e0d54df7224c473a8aa16bcc258701fe0559d6b09b0b3cb151130bd  public/brand/impersonae.png
```
