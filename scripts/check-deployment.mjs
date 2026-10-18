import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

async function fetchChecked(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000), cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${new URL(url).pathname}`);
  return response;
}

async function checkBackend() {
  const { publicEnvironment, validatePublicEnvironment } = await import('./release-utils.mjs');
  const config = validatePublicEnvironment(await publicEnvironment(), { production: true });
  const origin = new URL(config.appUrl).origin;
  const endpoint = `${config.backendUrl}/functions/v1/big-match/events/${encodeURIComponent(config.eventSlug)}`;
  const response = await fetchChecked(endpoint, { headers: { apikey: config.publishableKey, Origin: origin, Accept: 'application/json' } });
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin, 'The backend must allow the production origin.');
  const event = await response.json();
  assert.equal(event.slug, config.eventSlug);
  for (const [route, method] of [['me', 'PUT'], ['preorder', 'POST']]) {
    const preflight = await fetchChecked(`${endpoint}/${route}`, {
      method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'apikey,authorization,content-type' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
    assert.ok(preflight.headers.get('Access-Control-Allow-Methods')?.split(',').map(value => value.trim()).includes(method));
    const allowedHeaders = (preflight.headers.get('Access-Control-Allow-Headers') || '').toLowerCase().split(',').map(value => value.trim());
    for (const name of ['apikey', 'authorization', 'content-type']) assert.ok(allowedHeaders.includes(name));
  }
  console.info(`Production-origin CORS verified: event ${event.status}, ${event.activeCardIds.length} cards, pre-order enabled ${event.preorderEnabled === true}. GET/OPTIONS only; no participation, identity or pre-order created.`);
}

async function checkLive() {
  const appUrl = new URL(process.env.VITE_APP_URL || '');
  assert.equal(appUrl.href, 'https://bigmatch.justcolors.net/');
  const version = process.env.EXPECTED_VERSION;
  assert.match(version || '', /^[a-f0-9]{16}$/);
  const integrity = JSON.parse(process.env.EXPECTED_FILES || '{}');
  assert.ok(integrity['index.html'] && integrity['build-info.json'] && integrity['sw.js']);
  let ready = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const response = await fetchChecked(new URL(`build-info.json?release=${version}`, appUrl));
      const info = await response.json();
      if (info.version === version && info.base === '/') { ready = true; break; }
    } catch { /* Allow certificate/CDN provisioning time, without disabling TLS checks. */ }
    if (attempt < 11) await delay(10000);
  }
  assert.ok(ready, 'The expected root-domain release is not yet reachable over valid HTTPS. Deployment may have completed; recheck certificate/CDN status.');
  const files = Object.entries(integrity);
  for (let offset = 0; offset < files.length; offset += 4) {
    await Promise.all(files.slice(offset, offset + 4).map(async ([file, expected]) => {
      assert.ok(/^[A-Za-z0-9_./-]+$/.test(file) && !file.startsWith('/') && !file.split('/').includes('..'));
      assert.match(expected, /^[a-f0-9]{64}$/);
      const url = new URL(file, appUrl); url.searchParams.set('release', version);
      const response = await fetchChecked(url);
      assert.equal(new URL(response.url).origin, appUrl.origin);
      const actual = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
      assert.equal(actual, expected, `Deployed bytes differ for ${file}.`);
    }));
  }
  const legacy = await fetchChecked('https://emilioquattrini.github.io/big-match/');
  const destination = new URL(legacy.url);
  assert.equal(destination.origin, appUrl.origin, 'The old GitHub Pages URL must redirect to the custom domain.');
  assert.equal(destination.pathname, '/');
  console.info(`HTTPS release ${version} verified: ${files.length} public files match the checked artifact byte for byte; the old GitHub URL redirects to the new root. No visitor data was written.`);
}

try {
  if (process.argv.includes('--backend')) await checkBackend();
  else if (process.argv.includes('--live')) await checkLive();
  else throw new Error('Choose --backend or --live.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Deployment verification failed.');
  process.exitCode = 1;
}
