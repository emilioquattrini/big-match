# BIG MATCH implementation contract

Confirmed 2026-10-06: 13 existing cards, extensible catalogue, visitor phones first, catalogue requests only; no newsletter. Preserve the existing English UI and artwork. Repository branch `feat/big-match-production`.

## Shared files and ownership

Root owns package/build setup, `index.html`, `src/main.ts`, `src/styles.css`, `src/api.ts`, `src/storage.ts`, `src/types.ts`, configuration and integration.
Frontend specialist owns catalogue extraction, `catalog/impersonae-v1.json`, images in `public/cards/`, logo assets, `src/domain.ts`, `src/poster.ts`, domain/poster tests and `docs/CATALOG.md`.
Backend specialist owns `supabase/` (migration, seed and one Edge Function), database integration tests, `docs/BACKEND.md`.
Release specialist owns `.github/workflows/`, `scripts/` release checks/build worker helper, `public/sw.js` if needed, `tests/e2e/`, `docs/RELEASE.md`, `docs/ACCEPTANCE.md`. Coordinate package scripts with root; do not edit package.json or others' files.

## IDs and catalogue

Card IDs are stable integers 1..13 initially. Never reuse an ID. Slugs lower-case original card names. JSON shape `{deckVersion:"impersonae-v1",cards:[{id,slug,name,image,alt,ordinal}]}`. Image is app-base-relative `cards/cyborg.jpg` etc. Logo path `brand/impersonae.jpg` or preserve actual original type. Append new cards; don't renumber existing cards. Event validates active card IDs server-side. Frontend must refuse incompatible/unavailable catalogue data rather than use unknown card assets.

## API

Single Supabase Edge Function `big-match`, `verify_jwt=false`, routes below after the `/big-match` path component. Public routes are unauthenticated; requests may include publishable apikey. All private routes verify bearer token using Supabase Auth getUser and pass verified UID to service-role-only RPCs. Client cannot execute privileged RPCs directly. CORS configured to exact permitted origins; CORS is not authorization. Standard errors `{error:{code,message}}`, status 400 invalid, 401 auth, 403 forbidden, 404 absent, 409 revision/idempotency conflict, 410 deleted session/event closed, 429 limit, 503 configuration/unavailable. No email/PII logs.

GET `/events/:slug`: EventConfig.
GET `/events/:slug/mind`: MindSnapshot; public aggregates only, no user IDs; ETag/private data never cached.
GET `/events/:slug/me`: PersonalResult; bearer required, no-store.
PUT `/events/:slug/me`: body `{cardIds:[1,2,3],requestId:UUID,expectedRevision:0}`; Ack. Sort canonical IDs; exactly three distinct enabled IDs. One active row per actor/event. First expectedRevision=0. Transaction checks existing receipt before expectedRevision, same key/payload => original Ack; changed payload => 409. Revisions prevent lost updates. Event version increments on real mutations only.
DELETE `/events/:slug/me`: `{requestId:UUID}`; `{deleted:true}`. Tombstone actor/event prevents stale PUT resurrection. Explicit browser erasure signs out/removes cache; future new participation needs a new anonymous identity. Retain only necessary deletion receipt/tombstone until retention cleanup.
POST `/events/:slug/contact`: public body `{email,name?,privacyVersion,requestId:UUID,website?:""}`; `{saved:true,requestId}`. Contact is optional, no newsletter, and does not create an anonymous Auth user. Server configuration controls whether enabled; no success unless saved. Bound size/rate (network hash and global budget), honeypot, verify consent notice version. Keep personal contacts separate with no participation/session foreign key. Idempotent receipt and no raw email logs.

EventConfig: `{slug,title,question,deckVersion,status:"draft"|"open"|"closed",activeCardIds:number[],contactEnabled:boolean,privacyVersion:string,privacyNotice:string,controllerName:string,controllerEmail:string,retentionDays:number}`.
Ack: `{participationId:string,revision:number,requestId:string,cardIds:[number,number,number],updatedAt:string}`.
MindSnapshot: `{total:number,cardCounts:Record<string,number>,pairCounts:Record<string,number>,version:number,asOf:string}`. Pair keys `"1-2"` sorted.
PersonalResult: `{participation:Ack|null,matches:{exact:number,close:number}|null,mind:MindSnapshot}`. Read current entry and all stats from ONE coherent SQL statement/snapshot; avoid self subtraction from a stale global cache.

## UI / unavailable backend

Vite env variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_EVENT_SLUG` (default big-2026), `VITE_APP_BASE` (default /big-match/), `VITE_APP_URL` (canonical public app root optional).
No backend configured => interactive local poster and explicit community unavailable state. Never fake global data or successful save/contact. Local selection/result persists safely. Backend with no responses is genuine zero. New anon sign-in lazily at first private operation, refresh through SDK. GET /me before a new update; preserve requestId and expectedRevision while retrying the same pending payload. Saving and rendering have independent states. Link `#/r/big-2026/impersonae-v1/1-2-3` opens read-only, does not create participation. Shared view counts reflect public aggregate, never pretend to be the owner's personal match count.

## Domain exports (frontend specialist)

Provide `canonicalTrio(ids:number[], validIds?:ReadonlySet<number>): readonly [number,number,number]`, `combinationKey(deckVersion:string,ids:number[]):string`, `combinationNumber(ids:number[]):number` using combinadic rank and stable ordinals/IDs; `computeMatches(all:readonly {id:string;cardIds:readonly number[]}[],ownId:string):{exact:number,close:number}`, `computeMind(all,... optional version)` if useful; `buildResultHash(eventSlug,deckVersion,ids)`, `parseResultHash(hash,validIds,expectedEvent,expectedDeck):number[]|null`. Use strict route validation.
Poster API: `renderPoster(cards:readonly Card[], options:{code:string;question:string;logoUrl:string;baseUrl:string}):Promise<Blob>`. 1080x1920 PNG, original artwork, canvas own renderer (no live DOM mutation or html2canvas CDN), deterministic geometry, fonts available locally or robust fallback. Provide cancellation-free pure renderer + cache at caller, no native share side effects. Export `POSTER_WIDTH`, `POSTER_HEIGHT`. Do not change supplied art.

## Required regression proof

ABC,ABC,ABD,ACD,BCD,AEF,DEF => own ABC exact1 close3. Replay same mutation doesn't duplicate; modified payload same key conflicts; stale revision conflicts but same accepted request returns original receipt; deleting prevents late recreate; public no per-user data; own reads coherent; event closed rejects writes; invalid cards rejected; contacts false success impossible. 286 current trios and optional 52 expansion no code collision. UI rapid third selection removal safe; modal keyboard; reload; single share call/cancel/fallback; PNG1080x1920; mobile layout; no unknown APIs cached; offline honest.
