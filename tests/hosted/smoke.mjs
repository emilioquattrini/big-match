#!/usr/bin/env node
/**
 * Opt-in hosted gateway/Auth smoke test; never part of the automatic test glob.
 * No administrator key, database URL, saved token or real contact is accepted.
 *
 * 1. Choose a fresh UUID and set BIG_MATCH_SMOKE_EVENT=smoke-<uuid>.
 * 2. BIG_MATCH_SMOKE_MODE=setup node tests/hosted/smoke.mjs > /tmp/smoke.sql
 *    Review/apply that SQL with an existing authorized administrator workflow.
 *    It creates only a new 30-minute test event, never changes big-2026.
 * 3. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, BIG_MATCH_SMOKE_ORIGIN,
 *    BIG_MATCH_SMOKE_MODE=run and BIG_MATCH_SMOKE_WRITE=1 in an untracked env file.
 *    node --env-file=/path/to/untracked.env tests/hosted/smoke.mjs
 *
 * Run only after hosted secrets and anonymous Auth are configured. A fresh run
 * creates seven anonymous sessions and one synthetic .invalid catalogue request.
 * It deletes its responses and signs out in finally, also on assertion failure.
 * The synthetic contact and deletion tombstones remain until normal retention;
 * the hourly cleanup also removes app-tracked anonymous Auth users when due.
 * A signup committed before a lost response can leave an untracked anonymous
 * user; inspect recent anonymous creations in the dedicated project in that case.
 * A failed network cleanup is reported and must be inspected by the operator.
 * No load/performance or device/browser compatibility claim follows from this.
 */
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const TITLE = 'BIG MATCH hosted smoke test';
const PRIVACY = 'hosted-smoke-v1';
const EVENT = /^smoke-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
class SmokeFailure extends Error {}
function check(value, message) { if (!value) throw new SmokeFailure(message); }
function checkedEvent(value) {
  check(typeof value === 'string' && EVENT.test(value), 'Set BIG_MATCH_SMOKE_EVENT to a fresh smoke-<UUID> slug; production event slugs are refused.');
  return value;
}

export function createSetupSql(slug) {
  checkedEvent(slug);
  // The slug has already been restricted to the fixed UUID grammar above.
  return `-- Synthetic isolated smoke fixture only. No original event is changed.
-- A repeated slug fails rather than reusing or reopening an existing event.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $smoke_setup$
DECLARE v_event uuid;
BEGIN
  IF (SELECT count(*) FROM big_match.cards WHERE deck_version='impersonae-v1' AND id BETWEEN 1 AND 13) <> 13 THEN
    RAISE EXCEPTION 'BM_SMOKE_SEED_REQUIRED';
  END IF;
  INSERT INTO big_match.events(
    slug,title,question,deck_version,starts_at,ends_at,collection_ready,
    contact_enabled,privacy_version,privacy_notice,controller_name,controller_email,retention_days
  ) VALUES(
    '${slug}','${TITLE}','Synthetic test: choose three cards.','impersonae-v1',
    now()-interval '5 minutes',now()+interval '30 minutes',true,true,
    '${PRIVACY}','Synthetic test fixture only; no real visitor or real contact data. Responses are erased after verification and remaining technical data uses one-day retention.',
    'Synthetic Test Controller','smoke@example.invalid',1
  ) RETURNING id INTO v_event;
  INSERT INTO big_match.event_cards(event_id,deck_version,card_id)
  SELECT v_event,'impersonae-v1',id FROM big_match.cards
  WHERE deck_version='impersonae-v1' AND id BETWEEN 1 AND 13;
  UPDATE big_match.events SET status='open' WHERE id=v_event;
END;
$smoke_setup$;
COMMIT;
`;
}

function settings(env) {
  const event = checkedEvent(env.BIG_MATCH_SMOKE_EVENT);
  check(env.BIG_MATCH_SMOKE_WRITE === '1', 'Set BIG_MATCH_SMOKE_WRITE=1 only for the isolated synthetic event.');
  let url; let origin;
  try { url = new URL(env.SUPABASE_URL); origin = new URL(env.BIG_MATCH_SMOKE_ORIGIN); }
  catch { throw new SmokeFailure('Set SUPABASE_URL and BIG_MATCH_SMOKE_ORIGIN to valid HTTPS origins.'); }
  check(url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash,
    'SUPABASE_URL must be an HTTPS project origin without credentials, paths or query parameters.');
  check(origin.protocol === 'https:' && origin.origin === env.BIG_MATCH_SMOKE_ORIGIN,
    'BIG_MATCH_SMOKE_ORIGIN must exactly match an allowed HTTPS origin, without an app path.');
  const key = env.SUPABASE_PUBLISHABLE_KEY ?? '';
  check(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key), 'Supply only a modern sb_publishable_ key; secret/service-role keys are refused.');
  return {url: url.origin, origin: origin.origin, key, event};
}

async function boundedFetch(input, init) {
  try { return await fetch(input, {...init, redirect: 'error', signal: AbortSignal.timeout(15000)}); }
  catch { throw new SmokeFailure('A hosted network request failed or timed out; no response body or credential was logged.'); }
}
function equal(a,b) { return JSON.stringify(a) === JSON.stringify(b); }
function invariant(snapshot, total) {
  check(snapshot && snapshot.total === total && Number.isSafeInteger(snapshot.version), 'Unexpected coherent participation total or version.');
  check(Object.values(snapshot.cardCounts).reduce((a,b)=>a+b,0) === 3*total, 'Card-frequency invariant failed.');
  check(Object.values(snapshot.pairCounts).reduce((a,b)=>a+b,0) === 3*total, 'Pair-frequency invariant failed.');
}

export async function runSmoke(env = process.env) {
  const cfg = settings(env);
  const endpoint = cfg.url + '/functions/v1/big-match/events/' + cfg.event;
  const actors = []; let cleanupFailed = false;
  async function request(path = '', {method = 'GET', token, body, status = 200, extra = {}} = {}) {
    const response = await boundedFetch(endpoint + path, {
      method, cache: 'no-store',
      headers: {apikey: cfg.key, Origin: cfg.origin, Accept: 'application/json',
        ...(token ? {Authorization: 'Bearer ' + token} : {}),
        ...(body === undefined ? {} : {'Content-Type': 'application/json'}), ...extra},
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
    check(response.status === status, 'Unexpected HTTP status for ' + method + ' ' + (path.split('?')[0] || '/event') + ': ' + response.status + ' (expected ' + status + ').');
    check(response.headers.get('access-control-allow-origin') === cfg.origin, 'The hosted response does not allow the configured browser origin.');
    let value;
    if (status !== 204 && status !== 304) {
      try { value = await response.json(); } catch { throw new SmokeFailure('The hosted response is not JSON.'); }
    }
    return {response, value};
  }
  const pass = message => process.stdout.write('PASS ' + message + '\n');
  try {
    const {value: config} = await request();
    check(config.slug === cfg.event && config.title === TITLE && config.privacyVersion === PRIVACY && config.retentionDays === 1,
      'The event does not have the dedicated synthetic fixture markers; refusing writes.');
    check(config.status === 'open' && config.contactEnabled === true && config.deckVersion === 'impersonae-v1', 'The dedicated fixture is not open/configured.');
    check(equal(config.activeCardIds, Array.from({length:13},(_,i)=>i+1)), 'The fixture must contain the 13 original card IDs.');
    const {value: baseline, response: baselineResponse} = await request('/mind?smoke=' + randomUUID());
    invariant(baseline, 0); check(baseline.version === 0, 'Use a new never-used smoke event for each run.');
    const etag = baselineResponse.headers.get('etag'); check(etag, 'Public aggregate ETag is missing.');
    await request('/mind', {status:304, extra:{'If-None-Match':etag}});
    await request('/me', {status:401});
    await request('/me', {method:'OPTIONS', status:204, extra:{'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,apikey,content-type'}});
    const blocked = await boundedFetch(endpoint, {headers:{apikey:cfg.key, Origin:'https://blocked.example.invalid'}});
    check(blocked.status === 403 && !blocked.headers.has('access-control-allow-origin'), 'Unexpected response to a disallowed browser origin.');
    pass('public configuration, zero counters, ETag, private authentication and CORS');

    const fixture = [[1,2,3],[1,2,3],[1,2,4],[1,3,4],[2,3,4],[1,5,6],[4,5,6]];
    for (const cardIds of fixture) {
      const client = createClient(cfg.url, cfg.key, {
        auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false},
        global:{fetch:boundedFetch},
      });
      const signed = await client.auth.signInAnonymously();
      check(!signed.error && signed.data.session?.access_token && signed.data.user?.is_anonymous === true,
        'Anonymous Auth did not return a usable session; check enablement, CAPTCHA and limits. An interrupted signup may require inspection of recent anonymous Auth creations in the dedicated project.');
      const actor = {client, token:signed.data.session.access_token, requestId:randomUUID(), deleteId:randomUUID(), erased:false};
      actors.push(actor);
      actor.body = {cardIds, requestId:actor.requestId, expectedRevision:0};
      actor.ack = (await request('/me', {method:'PUT', token:actor.token, body:actor.body})).value;
      check(actor.ack.revision === 1 && actor.ack.requestId === actor.requestId && equal(actor.ack.cardIds,cardIds), 'Initial save acknowledgement is inconsistent.');
    }
    const owner = actors[0];
    const own = await request('/me', {token:owner.token});
    check(own.response.headers.get('cache-control') === 'no-store', 'Private results must not be cached.');
    check(own.value.matches.exact === 1 && own.value.matches.close === 3, 'Known matching fixture did not return exact=1, close=3.');
    invariant(own.value.mind, 7);
    for (let i=0;i<3;i++) {
      const replay = await request('/me', {method:'PUT', token:owner.token, body:owner.body});
      check(equal(replay.value,owner.ack), 'A repeated request did not return its original acknowledgement.');
    }
    await request('/me', {method:'PUT', token:owner.token, body:{...owner.body,cardIds:[1,2,4]}, status:409});
    await request('/me', {method:'PUT', token:owner.token, body:{cardIds:[1,1,2],requestId:randomUUID(),expectedRevision:1}, status:400});
    await request('/me', {method:'PUT', token:owner.token, body:{cardIds:[1,2,4],requestId:randomUUID(),expectedRevision:0}, status:409});
    await request('/me', {method:'PUT', token:owner.token, body:{cardIds:[1,4,5],requestId:randomUUID(),expectedRevision:1}});
    const oldReceipt = await request('/me', {method:'PUT', token:owner.token, body:owner.body});
    check(equal(oldReceipt.value,owner.ack), 'Original receipt failed after a later revision.');
    const edited = (await request('/me', {token:owner.token})).value;
    check(edited.participation.revision === 2 && equal(edited.participation.cardIds,[1,4,5]), 'The current result lost its latest revision after receipt replay.');
    invariant(edited.mind, 7);
    pass('seven real anonymous sessions, coherent matching, retries and revision conflicts');

    for (const token of [undefined,owner.token]) {
      const denied = await boundedFetch(cfg.url + '/rest/v1/rpc/bm_mind', {
        method:'POST', headers:{apikey:cfg.key,'Content-Type':'application/json',...(token ? {Authorization:'Bearer '+token} : {})},
        body:JSON.stringify({p_slug:cfg.event}),
      });
      check([401,403,404].includes(denied.status), 'A browser role unexpectedly reached a privileged database RPC.');
    }
    const contact = {email:cfg.event+'@example.invalid',name:'Synthetic hosted smoke fixture',privacyVersion:PRIVACY,requestId:randomUUID()};
    const first = await request('/contact', {method:'POST',body:contact});
    const duplicate = await request('/contact', {method:'POST',body:contact});
    check(first.value.saved === true && first.value.requestId === contact.requestId && equal(first.value,duplicate.value), 'Synthetic catalogue request was not acknowledged idempotently.');
    await request('/contact', {method:'POST',body:{...contact,requestId:randomUUID(),privacyVersion:'obsolete'},status:409});
    pass('browser RPC segregation and public catalogue request with no added Auth session');

    const deletion = await request('/me', {method:'DELETE',token:owner.token,body:{requestId:owner.deleteId}});
    check(deletion.value?.deleted === true, 'Owner deletion was not acknowledged.');
    owner.erased = true;
    await request('/me', {method:'DELETE',token:owner.token,body:{requestId:owner.deleteId}});
    await request('/me', {token:owner.token,status:410});
    await request('/me', {method:'PUT',token:owner.token,body:owner.body,status:410});
    invariant((await request('/me', {token:actors[1].token})).value.mind,6);
    pass('erasure, deletion replay and stale-write resurrection prevention');
  } finally {
    for (const actor of actors) {
      if (!actor.erased) {
        try {
          const erased = await request('/me', {method:'DELETE',token:actor.token,body:{requestId:actor.deleteId}});
          check(erased.value?.deleted === true, 'Deletion was not acknowledged.'); actor.erased = true;
        }
        catch { cleanupFailed = true; }
      }
      try { const result = await actor.client.auth.signOut({scope:'local'}); if (result.error) cleanupFailed = true; }
      catch { cleanupFailed = true; }
    }
    if (actors.length) {
      if (cleanupFailed) process.stderr.write('Cleanup incomplete: inspect this synthetic event and recent anonymous Auth creations in the dedicated project, including any interrupted signup; no credentials were logged.\n');
      else process.stdout.write('CLEANUP deletion acknowledged for all known test responses and sessions signed out; synthetic contact/tombstones use normal one-day retention.\n');
    }
  }
  check(!cleanupFailed, 'Some hosted test cleanup requests failed.');
  pass('hosted smoke complete; production event untouched');
}

export async function main(env = process.env) {
  const mode = env.BIG_MATCH_SMOKE_MODE ?? 'help';
  if (mode === 'help' || process.argv.includes('--help')) {
    process.stdout.write('BIG MATCH hosted smoke test (manual opt-in, Node 24+)\nSet BIG_MATCH_SMOKE_MODE=setup to print isolated fixture SQL, or run to test it.\nRequired event: BIG_MATCH_SMOKE_EVENT=smoke-<fresh UUID>.\nRun also requires BIG_MATCH_SMOKE_WRITE=1, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and BIG_MATCH_SMOKE_ORIGIN.\nUse an untracked --env-file. See this file header for side effects and cleanup.\n');
    return;
  }
  if (mode === 'setup') { process.stdout.write(createSetupSql(env.BIG_MATCH_SMOKE_EVENT)); return; }
  check(mode === 'run', 'BIG_MATCH_SMOKE_MODE must be help, setup or run.');
  await runSmoke(env);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    process.stderr.write('Hosted smoke failed: ' + (error instanceof SmokeFailure ? error.message : 'unexpected client failure; details suppressed to keep credentials private.') + '\n');
    process.exitCode = 1;
  });
}
