import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

let db;
const migration = new URL('../../supabase/migrations/20261006232008_big_match.sql', import.meta.url);
const seed = new URL('../../supabase/seed.sql', import.meta.url);

async function rpc(name, args) {
  return db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE service_role');
    const placeholders = args.map((_, i) => '$' + (i + 1)).join(',');
    return (await tx.query('SELECT public.' + name + '(' + placeholders + ') AS result', args)).rows[0].result;
  });
}
async function actor(anonymous = true) {
  const id = randomUUID();
  await db.query('INSERT INTO auth.users(id,is_anonymous) VALUES($1,$2)', [id, anonymous]);
  return id;
}
async function event({ contact = false, cards = [1,2,3,4,5,6,7,8,9,10,11,12,13] } = {}) {
  const slug = 'test-' + randomUUID().slice(0,8);
  const { rows } = await db.query(
    "INSERT INTO big_match.events(slug,title,question,deck_version,starts_at,ends_at) VALUES($1,'Test','Choose 3','impersonae-v1',now()-interval '1 day',now()+interval '1 day') RETURNING id",
    [slug],
  );
  const id = rows[0].id;
  for (const c of cards) await db.query("INSERT INTO big_match.event_cards(event_id,deck_version,card_id) VALUES($1,'impersonae-v1',$2)", [id,c]);
  await db.query("UPDATE big_match.events SET collection_ready=true,privacy_version='test-v1',privacy_notice='Test notice: technical session, optional catalogue, deletion and a limited retention period.',controller_name='Test Controller',controller_email='test@example.invalid',contact_enabled=$2,status='open' WHERE id=$1", [id,contact]);
  return { slug, id };
}
async function put(slug, uid, ids, revision = 0, request = randomUUID()) {
  return rpc('bm_put', [slug, uid, ids, request, revision]);
}
async function mind(slug) { return rpc('bm_mind',[slug]); }
async function me(slug, uid) { return rpc('bm_me',[slug,uid]); }
function invariant(snapshot) {
  assert.equal(Object.values(snapshot.cardCounts).reduce((a,b)=>a+b,0),3*snapshot.total);
  assert.equal(Object.values(snapshot.pairCounts).reduce((a,b)=>a+b,0),3*snapshot.total);
}

describe('BIG MATCH actual PostgreSQL migration and service RPCs', { concurrency: false }, () => {
  before(async () => {
    db = new PGlite();
    // Only platform roles and Auth are stubbed; all app SQL, constraints, RLS and RPCs are real.
    await db.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, is_anonymous boolean NOT NULL DEFAULT true);');
    await db.exec(await readFile(migration,'utf8'));
    await db.exec(await readFile(seed,'utf8'));
  });
  after(async () => { await db.close(); });

  it('seeds the 13 original cards with a guarded draft and no fabricated participants', async () => {
    const config = await rpc('bm_event',['big-2026']);
    assert.equal(config.status,'draft');
    assert.equal(config.contactEnabled,false);
    assert.deepEqual(config.activeCardIds,Array.from({length:13},(_,i)=>i+1));
    assert.equal((await mind('big-2026')).total,0);
    const uid = await actor();
    await assert.rejects(put('big-2026',uid,[1,2,3]), /BM_EVENT_CLOSED/);
    await assert.rejects(db.exec("UPDATE big_match.events SET status='open' WHERE slug='big-2026'"), /check constraint/);
    await db.exec(await readFile(seed,'utf8'));
    assert.equal((await rpc('bm_event',['big-2026'])).status,'draft');
  });

  it('denies direct table and RPC access to both browser roles', async () => {
    for (const role of ['anon','authenticated']) {
      for (const sql of [
        'SELECT * FROM big_match.participations',
        'SELECT * FROM big_match_contacts.requests',
        "SELECT public.bm_mind('big-2026')",
        "SELECT public.bm_cleanup()",
      ]) {
        await assert.rejects(db.transaction(async tx => { await tx.exec('SET LOCAL ROLE '+role); return tx.exec(sql); }), /permission denied/);
      }
      const privilege = await db.query("SELECT has_function_privilege($1,'public.bm_put(text,uuid,integer[],uuid,integer)','EXECUTE') AS allowed", [role]);
      assert.equal(privilege.rows[0].allowed,false);
    }
    const policies = await db.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname IN ('big_match','big_match_contacts')");
    assert.equal(policies.rows[0].n,0);
    const unprotected = await db.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname IN ('big_match','big_match_contacts') AND c.relkind='r' AND NOT c.relrowsecurity");
    assert.equal(unprotected.rows[0].n,0);
  });

  it('rejects invalid/duplicate/unavailable cards atomically, even outside the UI', async () => {
    const e = await event({cards:[1,2,3,4,5,6]}); const uid = await actor();
    for (const ids of [[],[1],[1,2],[1,2,3,4],[1,1,2],[1,2,14],[1,2,13],[0,1,2],[1,2,null]]) {
      await assert.rejects(put(e.slug,uid,ids), /BM_INVALID_(CARDS|REQUEST)/);
    }
    assert.equal((await mind(e.slug)).total,0);
    const result=await me(e.slug,uid);
    assert.equal(result.participation,null); assert.equal(result.matches,null);
  });

  it('enforces exactly three distinct cards and event membership as database constraints', async () => {
    const e=await event({cards:[1,2,3]}); const uid=await actor();
    await db.query('INSERT INTO big_match.actors(event_id,actor_id) VALUES($1,$2)',[e.id,uid]);
    for (const ids of [[1,1,2],[1,2,null],[1,2,4]]) {
      await assert.rejects(db.query('INSERT INTO big_match.participations(event_id,actor_id,card_a,card_b,card_c,last_request_id) VALUES($1,$2,$3,$4,$5,$6)',[e.id,uid,...ids,randomUUID()]), /constraint|not-null/);
    }
    assert.equal((await mind(e.slug)).total,0);
  });

  it('computes exact=1 and close=3 from the known fixture, excluding self', async () => {
    const e=await event(); const ids=await Promise.all(Array.from({length:7},()=>actor()));
    const fixture=[[1,2,3],[1,2,3],[1,2,4],[1,3,4],[2,3,4],[1,5,6],[4,5,6]];
    for (let i=0;i<ids.length;i++) await put(e.slug,ids[i],fixture[i]);
    const result=await me(e.slug,ids[0]);
    assert.deepEqual(result.matches,{exact:1,close:3});
    assert.equal(result.mind.total,7);
    assert.deepEqual([result.mind.pairCounts['1-2'],result.mind.pairCounts['1-3'],result.mind.pairCounts['2-3']],[3,3,3]);
    assert.deepEqual([1,2,3,4,5,6].map(c=>result.mind.cardCounts[c]),[5,4,4,4,2,2]);
    invariant(result.mind);
    const publicStats=await mind(e.slug);
    assert.deepEqual(Object.keys(publicStats).sort(),['asOf','cardCounts','pairCounts','total','version']);
    assert.equal(JSON.stringify(publicStats).includes(ids[0]),false);
    const fresh=await actor();
    const freshResult=await me(e.slug,fresh);
    assert.equal(freshResult.participation,null);
    assert.equal(freshResult.matches,null);
  });

  it('reads first and edited responses with their own coherent counters, not a stale cache', async () => {
    const e=await event(); const a=await actor(); const b=await actor();
    const first=await put(e.slug,a,[3,1,2]);
    assert.deepEqual(first.cardIds,[1,2,3]);
    assert.deepEqual((await me(e.slug,a)).matches,{exact:0,close:0});
    await put(e.slug,b,[1,2,3]);
    assert.deepEqual((await me(e.slug,a)).matches,{exact:1,close:0});
    const edited=await put(e.slug,a,[1,4,5],first.revision);
    const result=await me(e.slug,a);
    assert.deepEqual(result.participation.cardIds,[1,4,5]);
    assert.equal(result.participation.revision,edited.revision);
    assert.deepEqual(result.matches,{exact:0,close:0});
    assert.equal(result.mind.total,2); invariant(result.mind);
  });

  it('returns the original receipt before revision checks, including 100 duplicate requests', async () => {
    const e=await event(); const uid=await actor(); const request=randomUUID();
    const args=[e.slug,uid,[1,2,3],request,0];
    const values=await Promise.all(Array.from({length:100},()=>rpc('bm_put',args)));
    assert(values.every(v=>JSON.stringify(v)===JSON.stringify(values[0])));
    assert.equal((await mind(e.slug)).total,1);
    assert.equal((await mind(e.slug)).version,1);
    const second=await put(e.slug,uid,[1,2,4],1);
    assert.equal(second.revision,2);
    const original=await rpc('bm_put',args);
    assert.deepEqual(original,values[0]);
    assert.deepEqual((await me(e.slug,uid)).participation.cardIds,[1,2,4]);
    await assert.rejects(put(e.slug,uid,[1,3,4],0,request), /BM_IDEMPOTENCY_CONFLICT/);
    await assert.rejects(put(e.slug,uid,[1,3,4],1), /BM_REVISION_CONFLICT/);
    const noop=await put(e.slug,uid,[4,2,1],2);
    assert.equal(noop.revision,2);
    assert.equal((await mind(e.slug)).version,2);
  });

  it('closes writes, keeps known receipts replayable, and freezes the published catalogue', async () => {
    const e=await event(); const uid=await actor(); const req=randomUUID();
    const saved=await put(e.slug,uid,[1,2,3],0,req);
    await assert.rejects(db.query('UPDATE big_match.event_cards SET enabled=false WHERE event_id=$1 AND card_id=13',[e.id]), /BM_CATALOGUE_FROZEN/);
    await assert.rejects(db.exec("UPDATE big_match.cards SET name='Renamed' WHERE deck_version='impersonae-v1' AND id=1"), /BM_CATALOGUE_FROZEN/);
    await db.query("UPDATE big_match.events SET status='closed' WHERE id=$1",[e.id]);
    await assert.rejects(db.query("UPDATE big_match.events SET status='draft' WHERE id=$1",[e.id]), /BM_CATALOGUE_FROZEN/);
    assert.deepEqual(await put(e.slug,uid,[1,2,3],0,req),saved);
    await assert.rejects(put(e.slug,uid,[1,2,4],1), /BM_EVENT_CLOSED/);
    assert.equal((await mind(e.slug)).total,1);
  });

  it('erases prior card receipts and prevents old or new PUT resurrection for the same actor', async () => {
    const e=await event(); const uid=await actor(); const req=randomUUID();
    await put(e.slug,uid,[1,2,3],0,req);
    const del=randomUUID();
    assert.deepEqual(await rpc('bm_delete',[e.slug,uid,del]),{deleted:true});
    assert.deepEqual(await rpc('bm_delete',[e.slug,uid,del]),{deleted:true});
    assert.deepEqual(await rpc('bm_delete',[e.slug,uid,randomUUID()]),{deleted:true});
    await assert.rejects(put(e.slug,uid,[1,2,3],0,req), /BM_DELETED/);
    await assert.rejects(put(e.slug,uid,[1,2,4],0), /BM_DELETED/);
    await assert.rejects(me(e.slug,uid), /BM_DELETED/);
    const snapshot=await mind(e.slug);
    assert.equal(snapshot.total,0); assert.equal(snapshot.version,2); invariant(snapshot);
    const receipts=await db.query('SELECT operation,payload,ack FROM big_match.receipts WHERE actor_id=$1',[uid]);
    assert.equal(receipts.rows.length,1);
    assert.equal(receipts.rows[0].operation,'delete');
    assert.deepEqual(receipts.rows[0].payload,{});
    const fresh=await actor();
    await put(e.slug,fresh,[1,2,3]);
    assert.equal((await mind(e.slug)).total,1);
  });

  it('bounds new writes atomically without charging accepted replays', async () => {
    const e=await event(); const uid=await actor(); const request=randomUUID();
    await put(e.slug,uid,[1,2,3],0,request);
    for (let i=0;i<9;i++) await put(e.slug,uid,[1,2,3],1);
    await assert.rejects(put(e.slug,uid,[1,2,4],1), /BM_RATE_LIMIT/);
    assert.equal((await mind(e.slug)).total,1);
    const replay=await put(e.slug,uid,[1,2,3],0,request);
    assert.equal(replay.revision,1);
  });

  it('persists catalogue requests only when enabled, with idempotence and separate data', async () => {
    const disabled=await event(); const e=await event({contact:true});
    const key='a'.repeat(64); const req=randomUUID();
    await assert.rejects(rpc('bm_contact',[disabled.slug,'buyer@example.invalid',null,'test-v1',randomUUID(),key]), /BM_CONTACT_DISABLED/);
    await assert.rejects(rpc('bm_contact',[e.slug,'buyer@example.invalid',null,'old-notice',randomUUID(),key]), /BM_PRIVACY_CHANGED/);
    await assert.rejects(rpc('bm_contact',[e.slug,'invalid',null,'test-v1',randomUUID(),key]), /BM_INVALID_REQUEST/);
    const args=[e.slug,' Buyer@Example.Invalid ','Buyer','test-v1',req,key];
    const saved=await rpc('bm_contact',args);
    assert.deepEqual(saved,{saved:true,requestId:req});
    assert.deepEqual(await rpc('bm_contact',args),saved);
    await assert.rejects(rpc('bm_contact',[e.slug,'different@example.invalid','Buyer','test-v1',req,key]), /BM_IDEMPOTENCY_CONFLICT/);
    await rpc('bm_contact',[e.slug,'buyer@example.invalid',null,'test-v1',randomUUID(),key]);
    const contacts=await db.query('SELECT email,name,purpose,status FROM big_match_contacts.requests WHERE event_id=$1',[e.id]);
    assert.deepEqual(contacts.rows,[{email:'buyer@example.invalid',name:'Buyer',purpose:'catalogue',status:'received'}]);
    assert.equal((await mind(e.slug)).total,0);
    const fks=await db.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='big_match_contacts'::regnamespace AND contype='f'");
    assert(fks.rows.every(r=>!r.definition.includes('actors')&&!r.definition.includes('participations')));
  });

  it('archives aggregate data and clears expired app-owned anonymous users, contacts and receipts', async () => {
    const e=await event({contact:true}); const anon=await actor(); const permanent=await actor(false); const untouched=await actor();
    await put(e.slug,anon,[1,2,3]); await put(e.slug,permanent,[1,2,4]);
    await rpc('bm_contact',[e.slug,'expire@example.invalid',null,'test-v1',randomUUID(),'b'.repeat(64)]);
    const before=await mind(e.slug);
    const result=await db.query("SELECT public.bm_cleanup(now()+interval '70 days') AS result");
    assert(result.rows[0].result.eventsArchived>=1);
    const after=await mind(e.slug);
    assert.deepEqual({...after,asOf:undefined},{...before,asOf:undefined});
    assert(Date.parse(after.asOf)>=Date.parse(before.asOf));
    assert.equal((await db.query('SELECT count(*)::int n FROM big_match.actors WHERE event_id=$1',[e.id])).rows[0].n,0);
    assert.equal((await db.query('SELECT count(*)::int n FROM big_match_contacts.requests WHERE event_id=$1',[e.id])).rows[0].n,0);
    assert.equal((await db.query('SELECT count(*)::int n FROM auth.users WHERE id=$1',[anon])).rows[0].n,0);
    assert.equal((await db.query('SELECT count(*)::int n FROM auth.users WHERE id=$1',[permanent])).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int n FROM big_match.auth_subjects WHERE actor_id=$1',[permanent])).rows[0].n,0);
    assert.equal((await db.query('SELECT count(*)::int n FROM auth.users WHERE id=$1',[untouched])).rows[0].n,1);
    await assert.rejects(put(e.slug,permanent,[1,2,4],0), /BM_DELETED/);
    const again=await db.query("SELECT public.bm_cleanup(now()+interval '70 days') AS result");
    assert.equal(again.rows[0].result.eventsArchived,0);
  });
});
