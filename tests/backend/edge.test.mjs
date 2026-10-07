import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createHandler } from '../../supabase/functions/big-match/handler.ts';

const SETTINGS = {
  SUPABASE_URL: 'https://backend.example.invalid',
  SUPABASE_SECRET_KEY: 'sb_secret_server_test_only',
  BIG_MATCH_ALLOWED_ORIGINS: 'https://emilioquattrini.github.io,http://localhost:5173',
  BIG_MATCH_RATE_LIMIT_SECRET: 'test-only-rate-secret-at-least-32-characters',
};
const appUrl='https://backend.example.invalid/functions/v1/big-match/events/test-edge';
const origin='https://emilioquattrini.github.io';
let db; let uid; let anotherUid; let handler; const calls=[];
const tokens=new Map();

function request(path='', {method='GET',body,token,headers={}}={}) {
  return new Request(appUrl+path,{
    method,headers:{
      Origin:origin,'x-forwarded-for':'192.0.2.1',
      ...(body!==undefined?{'Content-Type':'application/json'}:{}),
      ...(token?{Authorization:'Bearer '+token}:{}),...headers,
    },
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),
  });
}
async function gateway(input,init={}) {
  const url=new URL(input);
  assert.equal(url.origin,SETTINGS.SUPABASE_URL);
  const headers=new Headers(init.headers);
  assert.equal(headers.get('apikey'),SETTINGS.SUPABASE_SECRET_KEY);
  if(url.pathname==='/auth/v1/user') {
    calls.push({auth:headers.get('Authorization')});
    const id=tokens.get((headers.get('Authorization')??'').replace(/^Bearer /i,''));
    return Response.json(id?{id,is_anonymous:true}:{message:'invalid token'},{status:id?200:401});
  }
  const fn=url.pathname.split('/').at(-1);
  assert(['bm_event','bm_mind','bm_read_guard','bm_me','bm_put','bm_delete','bm_contact'].includes(fn));
  const args=JSON.parse(init.body);
  calls.push({fn,args});
  try {
    const result=await db.transaction(async tx=>{
      await tx.exec('SET LOCAL ROLE service_role');
      const names=Object.keys(args);
      const statement='SELECT public.'+fn+'('+names.map((name,i)=>name+'=> $'+(i+1)).join(',')+') AS value';
      return (await tx.query(statement,Object.values(args))).rows[0].value;
    });
    if(fn==='bm_read_guard')return new Response(null,{status:204});
    return Response.json(result);
  } catch(error) {
    return Response.json({message:error.message,code:error.code},{status:400});
  }
}

describe('Edge transport + real PostgreSQL RPC integration (Auth service mocked)',{concurrency:false},()=>{
  before(async()=>{
    db=new PGlite();
    await db.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean DEFAULT true);');
    await db.exec(await readFile(new URL('../../supabase/migrations/20261006232008_big_match.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../../supabase/seed.sql',import.meta.url),'utf8'));
    await db.exec("INSERT INTO big_match.events(slug,title,question,deck_version,starts_at,ends_at) VALUES('test-edge','Edge test','Choose 3','impersonae-v1',now()-interval '1 day',now()+interval '1 day')");
    await db.exec("INSERT INTO big_match.event_cards SELECT id,deck_version,n,true FROM big_match.events CROSS JOIN generate_series(1,13)n WHERE slug='test-edge'");
    await db.exec("UPDATE big_match.events SET status='open',collection_ready=true,privacy_version='test-v1',privacy_notice='Test-only privacy notice covering technical sessions, optional catalogue and erasure.',controller_name='Test Controller',controller_email='test@example.invalid' WHERE slug='test-edge'");
    uid=randomUUID(); anotherUid=randomUUID();
    await db.query('INSERT INTO auth.users(id) VALUES($1),($2)',[uid,anotherUid]);
    tokens.set('valid.token',uid);tokens.set('another.token',anotherUid);
    handler=createHandler({env:key=>SETTINGS[key],fetchImpl:gateway});
  });
  after(async()=>{await db.close();});

  it('serves safe public configuration and handles no-body RPC guard responses',async()=>{
    const response=await handler(request());
    assert.equal(response.status,200);
    const value=await response.json();
    assert.equal(value.slug,'test-edge');assert.equal(value.contactEnabled,false);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
    assert(!JSON.stringify(value).includes(SETTINGS.SUPABASE_SECRET_KEY));
  });
  it('fails closed when secrets/origins are not configured, with no upstream requests',async()=>{
    let called=false;
    const unconfigured=createHandler({env:()=>undefined,fetchImpl:async()=>{called=true;throw Error();}});
    const response=await unconfigured(request());
    assert.equal(response.status,503);assert.equal(called,false);
  });
  it('rejects foreign origins, supports preflight, and treats CORS separately from auth',async()=>{
    let start=calls.length;
    const forbidden=await handler(request('',{headers:{Origin:'https://attacker.invalid'}}));
    assert.equal(forbidden.status,403);assert.equal(calls.length,start);
    assert.equal(forbidden.headers.has('Access-Control-Allow-Origin'),false);
    const options=await handler(request('/me',{method:'OPTIONS'}));
    assert.equal(options.status,204);assert.equal(calls.length,start);
    const missing=await handler(request('/me'));
    assert.equal(missing.status,401);
    const invalid=await handler(request('/me',{token:'forged.token'}));
    assert.equal(invalid.status,401);
    assert(calls.some(c=>c.auth==='Bearer forged.token'));
  });
  it('passes only the Auth-verified UID and rejects owner spoofing',async()=>{
    const spoofed=await handler(request('/me',{method:'PUT',token:'valid.token',body:{
      cardIds:[1,2,3],requestId:randomUUID(),expectedRevision:0,actorId:anotherUid,
    }}));
    assert.equal(spoofed.status,400);
    const req=randomUUID();
    const accepted=await handler(request('/me',{method:'PUT',token:'valid.token',body:{cardIds:[3,1,2],requestId:req,expectedRevision:0}}));
    assert.equal(accepted.status,200);
    const ack=await accepted.json();assert.deepEqual(ack.cardIds,[1,2,3]);
    const sqlCall=calls.filter(c=>c.fn==='bm_put').at(-1);
    assert.equal(sqlCall.args.p_actor_id,uid);
    assert.equal(accepted.headers.get('Cache-Control'),'no-store');
    const other=await handler(request('/me',{token:'another.token'}));
    assert.equal((await other.json()).participation,null);
  });
  it('returns real personal counters with no-store, and public ETag/304 without private data',async()=>{
    const own=await handler(request('/me',{token:'valid.token'}));
    assert.equal(own.status,200);assert.equal(own.headers.get('Cache-Control'),'no-store');
    assert.deepEqual((await own.json()).matches,{exact:0,close:0});
    const publicResponse=await handler(request('/mind'));
    const publicData=await publicResponse.json();
    assert.equal(publicData.total,1);
    assert(!JSON.stringify(publicData).includes(uid));
    assert.equal(publicResponse.headers.get('Cache-Control'),'public, max-age=15, stale-while-revalidate=30');
    const unchanged=await handler(request('/mind',{headers:{'If-None-Match':publicResponse.headers.get('ETag')}}));
    assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');
  });
  it('validates IDs, revisions, malformed JSON and bounded streamed bodies before mutation',async()=>{
    for(const body of [
      {cardIds:[1,1,2],requestId:randomUUID(),expectedRevision:1},
      {cardIds:[1,2,3],requestId:'bad',expectedRevision:1},
      {cardIds:[1,2,3],requestId:randomUUID(),expectedRevision:-1},
      {cardIds:[1,2,3],requestId:randomUUID(),expectedRevision:'1'},
    ])assert.equal((await handler(request('/me',{method:'PUT',token:'valid.token',body}))).status,400);
    const malformed=new Request(appUrl+'/me',{method:'PUT',headers:{Origin:origin,Authorization:'Bearer valid.token','Content-Type':'application/json'},body:'{'});
    assert.equal((await handler(malformed)).status,400);
    const giant=request('/me',{method:'PUT',token:'valid.token',body:{payload:'x'.repeat(9000)}});
    const response=await handler(giant);assert.equal(response.status,400);assert.equal((await response.json()).error.code,'BODY_TOO_LARGE');
  });
  it('does not claim contacts were saved while disabled, on invalid input or failed persistence',async()=>{
    const payload={email:'buyer@example.invalid',privacyVersion:'test-v1',requestId:randomUUID()};
    const disabled=await handler(request('/contact',{method:'POST',body:payload}));
    assert.equal(disabled.status,503);assert.equal((await disabled.json()).error.code,'BM_CONTACT_DISABLED');
    await db.exec("UPDATE big_match.events SET contact_enabled=true WHERE slug='test-edge'");
    const bot=await handler(request('/contact',{method:'POST',body:{...payload,website:'spam'}}));
    assert.equal(bot.status,400);
    const wrongNotice=await handler(request('/contact',{method:'POST',body:{...payload,privacyVersion:'old'}}));
    assert.equal(wrongNotice.status,409);
    const saved=await handler(request('/contact',{method:'POST',body:payload}));
    assert.equal(saved.status,200);assert.deepEqual(await saved.json(),{saved:true,requestId:payload.requestId});
    const repeat=await handler(request('/contact',{method:'POST',body:payload}));
    assert.equal(repeat.status,200);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM big_match_contacts.requests WHERE email='buyer@example.invalid'")).rows[0].n,1);
  });
  it('maps database errors and timeouts to safe responses without leaking SQL or PII',async()=>{
    const broken=createHandler({env:key=>SETTINGS[key],fetchImpl:async()=>Response.json({
      message:'SQL query contains private@example.invalid and sb_secret_hidden',detail:'secret query',
    },{status:500})});
    const response=await broken(request());
    assert.equal(response.status,503);
    const text=await response.text();assert(!text.includes('private@example.invalid'));assert(!text.includes('secret query'));
    const timeout=createHandler({env:key=>SETTINGS[key],fetchImpl:async()=>{throw Error('sensitive network error');}});
    assert.equal((await timeout(request())).status,503);
    const limited=createHandler({env:key=>SETTINGS[key],fetchImpl:async()=>Response.json({message:'BM_RATE_LIMIT'},{status:400})});
    const retry=await limited(request());
    assert.equal(retry.status,429);assert.equal(retry.headers.get('Retry-After'),'60');
    assert.equal(retry.headers.get('Cache-Control'),'no-store');
  });
  it('deletion prevents late requests and never caches an erased personal result',async()=>{
    const del=await handler(request('/me',{method:'DELETE',token:'valid.token',body:{requestId:randomUUID()}}));
    assert.equal(del.status,200);assert.deepEqual(await del.json(),{deleted:true});
    const late=await handler(request('/me',{method:'PUT',token:'valid.token',body:{cardIds:[1,2,3],requestId:randomUUID(),expectedRevision:0}}));
    assert.equal(late.status,410);assert.equal(late.headers.get('Cache-Control'),'no-store');
    const own=await handler(request('/me',{token:'valid.token'}));assert.equal(own.status,410);
  });
  it('does not provide an alternate admin, kiosk, or direct RPC route',async()=>{
    for(const suffix of ['/kiosk','/me/other','/contact/other']) assert.equal((await handler(request(suffix))).status,404);
    const admin=new Request('https://backend.example.invalid/functions/v1/big-match/admin/events/test-edge/close',{method:'POST',headers:{Origin:origin}});
    assert.equal((await handler(admin)).status,404);
    assert.equal((await handler(request('',{method:'PUT',body:{}}))).status,405);
  });
});
