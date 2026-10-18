import test from 'node:test';
import assert from 'node:assert/strict';
import { withProductionOrigin, PRODUCTION_ORIGIN } from '../../supabase/functions/big-match/deployment-env.ts';
import { createHandler } from '../../supabase/functions/big-match/handler.ts';

const legacy = 'https://emilioquattrini.github.io';

test('deployment origin addition preserves, trims and deduplicates configured origins', () => {
  const read = withProductionOrigin(name => name === 'BIG_MATCH_ALLOWED_ORIGINS'
    ? ` ${legacy}, ${PRODUCTION_ORIGIN}, ${legacy}, http://localhost:5173 ` : undefined);
  assert.deepEqual(read('BIG_MATCH_ALLOWED_ORIGINS').split(','), [legacy, PRODUCTION_ORIGIN, 'http://localhost:5173']);
});

test('deployment adapter never changes credentials or other configuration', () => {
  const values = { SUPABASE_URL: 'https://fixture.supabase.co', BIG_MATCH_RATE_LIMIT_SECRET: 'fixture-only-value' };
  const read = withProductionOrigin(name => values[name]);
  for (const [name, value] of Object.entries(values)) assert.equal(read(name), value);
  assert.equal(read('UNKNOWN_SETTING'), undefined);
  assert.equal(read('BIG_MATCH_ALLOWED_ORIGINS'), PRODUCTION_ORIGIN);
});

function handler(rawOrigins = legacy) {
  const values = {
    SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-server-only',
    BIG_MATCH_ALLOWED_ORIGINS: rawOrigins, BIG_MATCH_RATE_LIMIT_SECRET: 'x'.repeat(40),
  };
  return createHandler({ env: withProductionOrigin(name => values[name]), fetchImpl: async () => {
    assert.fail('CORS preflights must not contact Auth or the database.');
  } });
}

test('new and legacy origins support matching and preorder preflights without database writes', async () => {
  for (const origin of [legacy, PRODUCTION_ORIGIN]) {
    for (const [path, method] of [['me', 'PUT'], ['preorder', 'POST']]) {
      const response = await handler()(new Request(`https://fixture.supabase.co/functions/v1/big-match/events/big-2026/${path}`, {
        method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'apikey,content-type,authorization' },
      }));
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
      assert.ok(response.headers.get('Access-Control-Allow-Methods').split(', ').includes(method));
    }
  }
});

test('HTTP, unrelated origins and deceptive domain suffixes remain forbidden', async () => {
  for (const origin of ['http://bigmatch.justcolors.net', 'https://bigmatch.justcolors.net.example.invalid', 'https://untrusted.example.invalid', 'null']) {
    const response = await handler()(new Request('https://fixture.supabase.co/functions/v1/big-match/events/big-2026', { method: 'OPTIONS', headers: { Origin: origin } }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
});

test('invalid wildcard configuration is still rejected rather than silently accepted', async () => {
  const response = await handler('*')(new Request('https://fixture.supabase.co/functions/v1/big-match/events/big-2026', { method: 'OPTIONS', headers: { Origin: PRODUCTION_ORIGIN } }));
  assert.equal(response.status, 503);
});
