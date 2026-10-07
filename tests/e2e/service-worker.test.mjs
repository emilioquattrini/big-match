import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { buildServiceWorker } from '../../scripts/build-service-worker.mjs';
import { containsSecret, normalizeBase, publicConfigFingerprint, validatePublicEnvironment } from '../../scripts/release-utils.mjs';

async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'big-match-worker-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'assets'));
  await writeFile(path.join(dir, 'index.html'), '<!doctype html><title>BIG MATCH</title>');
  await writeFile(path.join(dir, 'assets/app.js'), 'window.appReady=true;');
  await writeFile(path.join(dir, 'manifest.webmanifest'), JSON.stringify({ name: 'BIG MATCH', icons: [] }));
  return dir;
}

function runtime(source) {
  const handlers = new Map();
  const stores = new Map();
  let network = async request => new Response(`static:${typeof request === 'string' ? request : request.url}`);
  let skips = 0;
  let claims = 0;
  const normalize = key => typeof key === 'string' ? key : key.url;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async put(key, response) { entries.set(normalize(key), response.clone()); },
        async match(key) { return entries.get(normalize(key))?.clone(); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const context = vm.createContext({
    self: {
      location: new URL('https://test.invalid/big-match/sw.js'),
      addEventListener(type, handler) { handlers.set(type, handler); },
      clients: { async claim() { claims++; } },
      async skipWaiting() { skips++; },
    },
    caches, URL, Request, Response, Headers,
    fetch: request => network(request),
  });
  vm.runInContext(source, context);
  return {
    stores, caches, get skips() { return skips; }, get claims() { return claims; },
    network(fn) { network = fn; },
    async emit(type, fields = {}) {
      let wait;
      let reply;
      handlers.get(type)({ ...fields, waitUntil(promise) { wait = promise; }, respondWith(promise) { reply = promise; } });
      if (wait) await wait;
      return reply ? await reply : undefined;
    },
  };
}

test('base validation prevents scope escaping and accepts the existing Pages prefix', () => {
  assert.equal(normalizeBase('/big-match/'), '/big-match/');
  assert.equal(normalizeBase('/'), '/');
  for (const bad of ['/big-match', '//elsewhere/', '/a/../', '/a%2fb/', '/a/?token=x', 'https://elsewhere/']) {
    assert.throws(() => normalizeBase(bad));
  }
});

test('public configuration rejects incomplete or privileged credentials without logging their values', () => {
  const local = validatePublicEnvironment({});
  assert.equal(local.configured, false);
  assert.throws(() => validatePublicEnvironment({}, { production: true }));
  assert.throws(() => validatePublicEnvironment({ VITE_SUPABASE_URL: 'https://test.supabase.co' }));
  assert.throws(() => validatePublicEnvironment({ VITE_SUPABASE_URL: 'https://test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_not-a-real-test-credential' }));
  assert.throws(() => validatePublicEnvironment({ VITE_APP_BASE: '/big-match/', VITE_APP_URL: 'https://example.invalid/' }));
  assert.throws(() => validatePublicEnvironment({ VITE_SERVICE_ROLE: 'forbidden' }));
  const claims = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
  assert.equal(containsSecret(`eyJhbGciOiJIUzI1NiJ9.${claims}.notreal`), true);
  assert.equal(containsSecret('ordinary public UI copy'), false);
  assert.notEqual(publicConfigFingerprint(local), publicConfigFingerprint({ ...local, eventSlug: 'another-event' }));
});

test('build is deterministic, scopes the manifest and changes its version when an asset changes', async t => {
  const dir = await fixture(t);
  const first = await buildServiceWorker({ distDir: dir });
  const second = await buildServiceWorker({ distDir: dir });
  assert.equal(first.version, second.version);
  assert.deepEqual(first.assets, ['assets/app.js', 'index.html', 'manifest.webmanifest']);
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.scope, '/big-match/');
  await writeFile(path.join(dir, 'assets/app.js'), 'window.appReady="v2";');
  const third = await buildServiceWorker({ distDir: dir });
  assert.notEqual(first.version, third.version);
});

test('build refuses accidental environment/database files in the public artifact', async t => {
  const dir = await fixture(t);
  await writeFile(path.join(dir, '.env'), 'PRIVATE_TEST_VALUE=not-a-real-secret');
  await assert.rejects(buildServiceWorker({ distDir: dir }), /Unexpected public artifact file/);
});

test('only the exact bundled license notice path is permitted and it is still inspected', async t => {
  const dir = await fixture(t);
  await mkdir(path.join(dir, 'licenses'));
  const notice = path.join(dir, 'licenses/THIRD_PARTY.txt');
  await writeFile(notice, 'Copyright Fixture Authors\nMIT License\n');
  const build = await buildServiceWorker({ distDir: dir });
  assert.ok(build.assets.includes('licenses/THIRD_PARTY.txt'));
  for (const unexpected of ['THIRD_PARTY.txt', 'licenses/OTHER.txt', 'licenses/third_party.txt', 'licenses/THIRD_PARTY.txt.bak']) {
    const file = path.join(dir, unexpected);
    await writeFile(file, 'Not an approved public notice.');
    await assert.rejects(buildServiceWorker({ distDir: dir }), /Unexpected public artifact file/);
    await rm(file);
  }
  await writeFile(notice, 'sb_secret_not_a_real_fixture_key');
  await assert.rejects(buildServiceWorker({ distDir: dir }), /private credential pattern/);
});

test('install caches the whole static version and does not activate an update automatically', async t => {
  const dir = await fixture(t);
  const config = await buildServiceWorker({ distDir: dir });
  const worker = runtime(await readFile(path.join(dir, 'sw.js'), 'utf8'));
  await worker.emit('install');
  assert.equal(worker.skips, 0);
  const store = worker.stores.get(config.prefix + config.version);
  assert.equal(store.size, 4);
  assert.ok(store.has('https://test.invalid/big-match/'));
  worker.network(async () => { throw new Error('offline'); });
  const response = await worker.emit('fetch', { request: { url: 'https://test.invalid/big-match/?source=qr', method: 'GET', mode: 'navigate', headers: new Headers(), cache: 'default' } });
  assert.match(await response.text(), /static:/);
  assert.equal(worker.skips, 0);
});

test('API, other origins, authorization, non-GET and query requests always bypass the cache', async t => {
  const dir = await fixture(t);
  await buildServiceWorker({ distDir: dir });
  const worker = runtime(await readFile(path.join(dir, 'sw.js'), 'utf8'));
  await worker.emit('install');
  const requests = [
    new Request('https://test.invalid/big-match/api/events/me'),
    new Request('https://test.invalid/big-match/events/big-2026/me'),
    new Request('https://test.supabase.co/functions/v1/big-match/events/big-2026/mind'),
    new Request('https://test.invalid/other-app/index.html'),
    new Request('https://test.invalid/big-match/assets/app.js', { headers: { authorization: 'Bearer test-only' } }),
    new Request('https://test.invalid/big-match/assets/app.js', { cache: 'no-store' }),
    new Request('https://test.invalid/big-match/assets/app.js', { method: 'POST', body: 'not-personal-data' }),
    new Request('https://test.invalid/big-match/assets/app.js?email=test'),
  ];
  const before = JSON.stringify([...worker.stores].map(([key, values]) => [key, [...values.keys()]]));
  for (const request of requests) assert.equal(await worker.emit('fetch', { request }), undefined);
  assert.equal(JSON.stringify([...worker.stores].map(([key, values]) => [key, [...values.keys()]])), before);
});

test('an incomplete precache fails installation and keeps the preceding version intact', async t => {
  const dir = await fixture(t);
  const config = await buildServiceWorker({ distDir: dir });
  const worker = runtime(await readFile(path.join(dir, 'sw.js'), 'utf8'));
  await worker.caches.open(config.prefix + 'previous');
  worker.network(async request => new Response('body', { status: request.url.endsWith('app.js') ? 503 : 200 }));
  await assert.rejects(worker.emit('install'), /Offline asset unavailable/);
  assert.equal(worker.stores.has(config.prefix + config.version), false);
  assert.equal(worker.stores.has(config.prefix + 'previous'), true);
  assert.equal(worker.skips, 0);
});

test('activation preserves one previous version and unrelated app caches; only explicit message skips waiting', async t => {
  const dir = await fixture(t);
  const config = await buildServiceWorker({ distDir: dir });
  const worker = runtime(await readFile(path.join(dir, 'sw.js'), 'utf8'));
  for (const name of ['another-app', config.prefix + 'old', config.prefix + 'previous']) await worker.caches.open(name);
  await worker.emit('install');
  await worker.emit('activate');
  assert.deepEqual(await worker.caches.keys(), ['another-app', config.prefix + 'previous', config.prefix + config.version]);
  assert.equal(worker.claims, 1);
  assert.equal(worker.skips, 0);
  const messages = [];
  await worker.emit('message', { data: { type: 'GET_VERSION' }, ports: [{ postMessage(value) { messages.push(value); } }] });
  assert.equal(messages[0].version, config.version);
  await worker.emit('message', { data: { type: 'UNKNOWN_MESSAGE' } });
  assert.equal(worker.skips, 0);
  await worker.emit('message', { data: { type: 'ACTIVATE_UPDATE' } });
  assert.equal(worker.skips, 1);
});
