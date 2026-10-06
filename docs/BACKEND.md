# BIG MATCH backend

Implemented for the confirmed first release: **13 original cards, visitors on their own phones, optional catalogue requests, no newsletter**. The dedicated hosted deployment and its dated verification evidence are recorded in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Production collection remains disabled until the actual event and privacy configuration are complete.

## Files and verification

- **supabase/migrations/20261006232008_big_match.sql**: schema, private tables, service-only RPCs, matching, deletion, limits and retention.
- **supabase/migrations/20261006232609_big_match_retention_indexes.sql**: indexes used by actor cleanup and catalogue receipt cascades.
- **supabase/migrations/20261006232718_big_match_retention_schedule.sql**: hosted `pg_cron` installation and hourly cleanup schedule.
- **supabase/seed.sql**: original catalogue and the big-2026 event in draft, with zero responses and contacts disabled. Re-running never resets an existing event.
- **supabase/functions/big-match/**: HTTP handler, Deno entrypoint and independent TypeScript configuration.
- **supabase/ops/install-retention.sql**: idempotent operator repair/reinstallation of the same hourly job; normally installed by the hosted migration.
- **tests/backend/**: database tests and HTTP handler integration tests.
- **tests/hosted/smoke.mjs**: manually invoked hosted gateway/Auth verification with an isolated synthetic event; never included in automatic test globs.

Run from the repository root:

~~~sh
node --test tests/backend/*.test.mjs
npx tsc --project supabase/functions/big-match/tsconfig.json --noEmit
~~~

The tests execute the portable application migration on PostgreSQL 18 through PGlite: SQL, constraints, functions, transactions, roles and RLS are real. The Edge test transport simulates Supabase Auth, while RPCs reach that database. PGlite queues a single connection; the 100-request replay test demonstrates database idempotence, not hosted multi-connection throughput. The `pg_cron` migration is specific to hosted Supabase and is verified on that service. Real Auth, gateway and scheduler checks are separate from these portable tests; see the deployment record for completed checks and remaining venue/device work.

### Manual hosted smoke test

After hosted configuration, use `node tests/hosted/smoke.mjs --help` for the explicit setup/run workflow. The setup mode prints SQL for a fresh `smoke-<UUID>` event open for 30 minutes; review and apply it through the authorized database workflow. Run mode checks the fixture markers and zero baseline before writing. It accepts only a public `sb_publishable_` key and uses an untracked environment file.

One run creates seven real anonymous Auth sessions and one synthetic catalogue request at an `example.invalid` address. It verifies coherent matching, retries, revision conflicts, private RPC restrictions, CORS, catalogue acknowledgement and erasure. Cleanup erases test responses and signs out; the remaining synthetic contact and technical records follow the fixture's one-day retention. Reported cleanup failures need operator inspection. The public event is never used. This is a functional gateway test, not a load test, a browser/device test or proof that the hourly retention job has run.

## Hosted configuration

Use a dedicated Supabase project owned by Emilio/Chiara, with testing separate from production. Apply the migration, seed a fresh database, and deploy the big-match Edge Function.

The function's **verify_jwt=false** setting allows the public configuration, aggregate and catalogue routes. Every private /me route still verifies its bearer token with Supabase Auth GET /auth/v1/user, the network operation behind getUser. It never trusts a UID supplied by the browser.

| Server environment variable | Value |
|---|---|
| SUPABASE_URL | Project URL, automatically injected by hosted Supabase. |
| SUPABASE_SECRET_KEYS | Automatically injected JSON dictionary; the handler reads its `default` server key. |
| BIG_MATCH_ALLOWED_ORIGINS | Exact origins separated by commas, including only approved production/preview origins. |
| BIG_MATCH_RATE_LIMIT_SECRET | Random secret of at least 32 characters for short-lived keyed rate-limit identifiers. |

In the hosted Dashboard or CLI, configure only the custom values **BIG_MATCH_ALLOWED_ORIGINS** and **BIG_MATCH_RATE_LIMIT_SECRET**. The `SUPABASE_` prefix is reserved: hosted secrets management rejects user-created names with that prefix. Do not upload local-only SUPABASE_* entries as hosted secrets.

SUPABASE_SECRET_KEY is supported for a local or self-hosted runtime where you control the environment; it is not a custom secret to create on hosted Supabase. A platform-supplied legacy SUPABASE_SERVICE_ROLE_KEY is also supported as a server fallback. Never put a secret key into VITE_* configuration or source control. Blank server configuration returns 503; it never opens a less protected mode.

For the existing site, the allowed origin is **https://emilioquattrini.github.io**, without /big-match/. CORS is a browser rule; verified Auth, database constraints and explicit RPC grants enforce access.

## Opening the event

The seed is deliberately in **draft**. Its planned date range covers 22–25 October 2026 in Europe/Rome. An earlier test should use a separate event with current test dates.

Before opening production, enter the actual controller name/email, approved privacy notice and version, event dates and retention choice. Then set collection_ready=true and status='open'. The database rejects an open event without required configuration or at least three admitted cards.

~~~sql
SELECT slug,status,starts_at,ends_at,deck_version,
       collection_ready,contact_enabled,privacy_version,
       controller_name,controller_email,retention_days
FROM big_match.events
WHERE slug='big-2026';
~~~

Mutations also check the collection date window. The public status is draft before the start and closed after the end. Configuring an event never creates sample responses.

Published event slugs/deck versions and catalogue membership are frozen. Card definitions used by an open or closed event cannot be edited in place. Append new stable IDs for a new draft event and preserve historical IDs/assets; do not revert a published event to draft to change the catalogue.

## Data and authorization

All application tables in big_match and big_match_contacts have RLS enabled and no client table policies or grants. Browser roles anon/authenticated cannot execute the application's RPCs directly. The Edge uses a server key and passes only verified identifiers.

RPCs use an empty fixed search path and qualified application objects. EXECUTE is explicitly granted to service_role and revoked from PUBLIC/anon/authenticated. A service key is privileged: the Edge handler must keep doing its ownership, validation and rate checks.

One actor/event has one mobile response. Three NOT NULL columns, an ascending constraint, and three foreign keys enforce exactly three different admitted cards. An event row lock serializes short mutations and cleanup, avoiding duplicate/revision races and lock-upgrade deadlocks. Read snapshots do not take that write lock. Measure the hosted peak before claiming higher throughput.

Contact requests live in a separate schema without a participation/actor foreign key. The only purpose is catalogue; there is no newsletter or automatic marketing.

## Matching, revisions and caching

The current participation and all its counters are read from **one coherent SQL statement**. Exact means three shared cards; close means exactly two, always excluding the current participation by record ID. No count subtracts self from an older public snapshot.

Acceptance fixture: ABC, ABC, ABD, ACD, BCD, AEF, DEF. For the first ABC, exact=1 and close=3. AB/AC/BC each have global frequency 3.

- Sum of card counts = 3 × total.
- Sum of pair counts = 3 × total.
- Pair keys are ascending strings such as 1-2.
- Empty events return genuine zeroes.
- Participation revision and event mind.version are distinct counters.
- Public data contains no participation IDs or Auth UIDs.

Private responses use Cache-Control: no-store. Public aggregates allow 15-second caching with a weak ETag based on event revision. The weak ETag tolerates a changed asOf timestamp when the counters remain identical. Opening a public composition link must not invoke PUT.

## Idempotence and erasure

Persist the pending request ID, payload and expected revision before sending it. The SQL transaction checks the receipt **before** checking whether that revision is now old. Same key/payload returns the original acknowledgement; changed payload returns 409. A known successful write remains replayable after collection closes.

A new request containing the current three cards is a semantic no-op: it gets a receipt with its own requestId, but revision, update timestamp and event version remain unchanged. GET /me reports the request ID of the last operation that actually changed the row. Do not infer success solely from equality of request IDs.

The acknowledgement is stable; current counters come from GET /me. A second tab may have changed the response between those operations. In that case GET returns the current official revision with its matching counters. A new update with an older expected revision gets 409.

DELETE removes the response and all old card payloads in its receipts, retaining only a minimal actor/event tombstone and deletion acknowledgement until retention. Repeated DELETE is safe. Late PUTs cannot recreate a deleted response. Browser erasure signs out and clears local state; a new participation requires a new anonymous identity.

## Catalogue requests and manual fulfilment

Enable contact_enabled only after notice configuration and manual fulfilment are ready. POST /contact is public with abuse controls; it does not require anonymous Auth. It saves a **request**, not a sent email.

Required: email, current privacyVersion, requestId. Optional: name. The handler limits bodies to 8 KiB, names to 120 characters, validates email, rejects a filled honeypot and unsupported fields. SQL independently validates the fields. Email is trimmed/lowercased and deduplicated within an event. A later duplicate never overwrites the first name.

No failed or disabled database operation can return saved=true. The response does not reveal whether the address already existed. Contact receipts are private and have no link to the cards selected.

An authorized operator reviews received requests, sends the agreed PDF manually and marks the request fulfilled. Decide the operator and checking frequency before opening the form.

~~~sql
SELECT id,email,name,created_at
FROM big_match_contacts.requests
WHERE status='received'
ORDER BY created_at;
~~~

Mark the reviewed request using a bound UUID parameter:

~~~sql
UPDATE big_match_contacts.requests
SET status='fulfilled',fulfilled_at=now()
WHERE id=$1::uuid;
~~~

Exports contain personal data. Keep them private and delete unneeded copies. Treat formula-like spreadsheet cell values beginning with =, +, - or @ as text. There is no public export endpoint.

## Rate limits and shared Wi-Fi

Supabase anonymous Auth defaults to 30 new identities per hour per IP. Review that quota for shared venue Wi-Fi. **Do not enable hosted Auth CAPTCHA without a matching frontend flow that obtains and passes captchaToken to signInAnonymously.** Confirm that end-to-end path on the chosen deployment. App limits do not replace Auth signup protection.

| Implemented application budget | Limit |
|---|---|
| New accepted mutations per Auth actor | 10/minute |
| Event mutations | 10,000/hour |
| Personal reads per actor | 120/minute |
| Gross Edge requests per keyed actor/network identifier | 600/minute |
| Gross Edge request budget | 12,000/minute |
| New catalogue requests per keyed network identifier | 10/minute |
| Catalogue requests per event | 1,000/hour |

A receipt replay does not consume mutation quota, but still passes the Edge gross request budget. PostgreSQL counters are atomic and not stored in per-process JavaScript variables. These are explicit migration constants to review against measured load.

The gateway must supply/overwrite x-forwarded-for for the public network guard. It is not an identity credential: a global database budget still applies if someone forges the network header. Private route budgets use the verified UID. Application rate identifiers are daily keyed hashes, remain pseudonymous, and are purged by cleanup. The application does not store raw IP addresses; hosting/Auth providers may have their own logs.

## Retention and operations

The 30-day default is a configuration proposal, not a legal deadline. At event end plus the chosen retention period, bm_cleanup():

1. Captures final aggregate counts without actor identifiers.
2. Closes event collection.
3. Deletes individual responses, actors and receipts.
4. Deletes catalogue requests/receipts when their own creation date plus the event retention period expires.
5. Deletes rate windows older than two days.
6. Deletes expired app-tracked anonymous Auth users with no remaining event actor.
7. Removes expired app tracking rows for permanent users without deleting their Auth accounts.

Unrelated Auth users are not deleted. A signup that never reaches a private app operation is not tracked; inspect unused expired anonymous accounts separately if signup abuse becomes a problem in this dedicated project.

The hosted migration installs `big-match-retention` with schedule `17 * * * *` (minute 17 of each UTC hour). The operator script supabase/ops/install-retention.sql can recreate the same named job. Verify scheduler execution in cron.job_run_details; the script uses the hosted pg_cron extension and is not executed by portable PGlite tests. Code existing in Git does not prove the hosted scheduler is active.

Backups and provider logs have separate retention. Test restoration in the separate project and reapply deletion/retention before reopening restored data. Keep backups, catalogue exports and secret files out of this public repository. Monitor error/status/operation codes without logging bodies, names, emails, JWTs, keys or stack traces.

## Deployment gates

The local suite covers schema execution, permissions, matching, coherent reads, retries, no-op, closure, erasure, retention, contact persistence, Edge authorization/validation, error redaction and caching.

Before public collection verify: actual secret configuration, real Auth and any CAPTCHA, shared-IP signup load, actual Supabase gateway behavior, migrations, scheduler execution, backup restore, and the full browser flow. Real iPhone/Android sharing and venue connectivity need device tests. This phones-first implementation has no kiosk/admin HTTP route.

## Primary references

- [Anonymous sign-ins and cleanup](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Auth getUser](https://supabase.com/docs/reference/javascript/auth-getuser)
- [API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Data API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Database functions](https://supabase.com/docs/guides/database/functions)
- [Edge authorization](https://supabase.com/docs/guides/functions/auth)
- [Edge environment variables and reserved secret names](https://supabase.com/docs/guides/functions/secrets)
- [Cron quickstart](https://supabase.com/docs/guides/cron/quickstart)
