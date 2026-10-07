/**
 * Runtime-neutral Edge handler. All private calls verify their bearer token with
 * Supabase Auth GET /auth/v1/user (the network operation behind getUser).
 * Database RPCs are service-role-only and never accept a browser-supplied UID.
 */
type Env = (name: string) => string | undefined;
type Fetcher = typeof fetch;
type JsonObject = Record<string, unknown>;
interface Config { url: string; key: string; allowedOrigins: Set<string>; rateSecret: string }

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message); this.status = status; this.code = code;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_BODY = 8192;
const errorMap: Record<string, [number, string]> = {
  BM_NOT_FOUND: [404, 'This event was not found.'],
  BM_AUTH_REQUIRED: [401, 'Your session could not be verified. Please try again.'],
  BM_INVALID_REQUEST: [400, 'Please check the request and try again.'],
  BM_INVALID_CARDS: [400, 'Choose three distinct cards available for this event.'],
  BM_IDEMPOTENCY_CONFLICT: [409, 'This request ID was already used for different data.'],
  BM_REVISION_CONFLICT: [409, 'Your response changed in another session. Reload your result.'],
  BM_DELETED: [410, 'This session has been erased. Start a new session to participate again.'],
  BM_EVENT_CLOSED: [410, 'This event is not accepting new responses.'],
  BM_CONTACT_DISABLED: [503, 'Catalogue requests are not available right now.'],
  BM_PRIVACY_CHANGED: [409, 'The privacy notice changed. Please read the current notice and try again.'],
  BM_RATE_LIMIT: [429, 'Too many requests. Please wait a minute and try again.'],
  BM_CONFIG_REQUIRED: [503, 'This event is not ready to collect responses.'],
  BM_CATALOGUE_FROZEN: [409, 'The catalogue cannot be changed for this event.'],
};

function config(env: Env): Config {
  let key = env('SUPABASE_SECRET_KEY') ?? '';
  if (!key && env('SUPABASE_SECRET_KEYS')) {
    try {
      const keys: unknown = JSON.parse(env('SUPABASE_SECRET_KEYS')!);
      if (keys && typeof keys === 'object' && 'default' in keys && typeof keys.default === 'string') key = keys.default;
    } catch { /* Generic configuration error below; never log secrets. */ }
  }
  // Legacy key is supported only in the server environment, never in shipped code.
  key ||= env('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const rawUrl = env('SUPABASE_URL') ?? '';
  const origins = (env('BIG_MATCH_ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const rateSecret = env('BIG_MATCH_RATE_LIMIT_SECRET') ?? '';
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new HttpError(503, 'CONFIG_UNAVAILABLE', 'The community service is not configured.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      !key || origins.length === 0 || rateSecret.length < 32) {
    throw new HttpError(503, 'CONFIG_UNAVAILABLE', 'The community service is not configured.');
  }
  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.origin !== origin || origin === '*') throw new Error();
    } catch { throw new HttpError(503, 'CONFIG_UNAVAILABLE', 'The community service is not configured.'); }
  }
  return { url: url.origin, key, allowedOrigins: new Set(origins), rateSecret };
}

function corsHeaders(origin: string | null, permitted: boolean): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Origin',
  });
  if (origin && permitted) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, if-none-match, x-client-info');
    headers.set('Access-Control-Expose-Headers', 'ETag, Retry-After');
    headers.set('Access-Control-Max-Age', '600');
  }
  return headers;
}

function json(value: unknown, headers: Headers, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers });
}

async function readBody(request: Request): Promise<JsonObject> {
  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(400, 'INVALID_BODY', 'Use a JSON request body.');
  }
  const length = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(length) && length > MAX_BODY) throw new HttpError(400, 'BODY_TOO_LARGE', 'The request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'INVALID_BODY', 'A request body is required.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > MAX_BODY) {
        await reader.cancel();
        throw new HttpError(400, 'BODY_TOO_LARGE', 'The request is too large.');
      }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as JsonObject;
  } catch { throw new HttpError(400, 'INVALID_BODY', 'The JSON request is invalid.'); }
}

function fields(body: JsonObject, allowed: string[]): void {
  if (Object.keys(body).some(key => !allowed.includes(key))) {
    throw new HttpError(400, 'INVALID_BODY', 'The request contains unsupported fields.');
  }
}
function requestId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new HttpError(400, 'INVALID_REQUEST_ID', 'A valid request ID is required.');
  return value.toLowerCase();
}
function cardIds(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== 3 || value.some(id => !Number.isInteger(id) || id < 1 || id > 1000) || new Set(value).size !== 3) {
    throw new HttpError(400, 'INVALID_CARDS', 'Choose three distinct cards.');
  }
  return [...value].sort((a, b) => a - b);
}

async function network(fetcher: Fetcher, input: string, init: RequestInit): Promise<Response> {
  try { return await fetcher(input, { ...init, signal: AbortSignal.timeout(10000), redirect: 'error' }); }
  catch { throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'The community service is temporarily unavailable. Your choice has not been confirmed.'); }
}

async function rpc(cfg: Config, fetcher: Fetcher, name: string, args: JsonObject): Promise<unknown> {
  const response = await network(fetcher, cfg.url + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {
      'apikey': cfg.key, 'Content-Type': 'application/json',
      ...(!cfg.key.startsWith('sb_secret_') ? { 'Authorization': 'Bearer ' + cfg.key } : {}),
    },
    body: JSON.stringify(args),
  });
  if (response.status === 204 && name === 'bm_read_guard') return null;
  let value: unknown;
  try { value = await response.json(); }
  catch { throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'The community service returned an invalid response.'); }
  if (!response.ok) {
    const message = value && typeof value === 'object' && 'message' in value ? value.message : '';
    if (typeof message === 'string' && errorMap[message]) {
      const [status, text] = errorMap[message];
      throw new HttpError(status, message, text);
    }
    // Never expose SQL, PostgREST hints, contact values, tokens or stack traces.
    throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'The community service is temporarily unavailable.');
  }
  return value;
}

async function getVerifiedUser(request: Request, cfg: Config, fetcher: Fetcher): Promise<string> {
  const auth = request.headers.get('Authorization') ?? '';
  if (!/^Bearer [A-Za-z0-9._-]+$/i.test(auth) || auth.length > 8192) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'A valid session is required.');
  }
  const response = await network(fetcher, cfg.url + '/auth/v1/user', {
    method: 'GET', headers: { 'apikey': cfg.key, 'Authorization': auth },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new HttpError(401, 'AUTH_REQUIRED', 'Your session expired. Please try again.');
    throw new HttpError(503, 'AUTH_UNAVAILABLE', 'Your session could not be verified right now.');
  }
  let value: unknown;
  try { value = await response.json(); } catch { throw new HttpError(503, 'AUTH_UNAVAILABLE', 'Your session could not be verified right now.'); }
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string' || !UUID.test(value.id)) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'A valid session is required.');
  }
  return value.id;
}

async function rateKey(cfg: Config, subject: string): Promise<string> {
  // Rotating daily limits correlation. A keyed hash is pseudonymous, not anonymisation.
  const date = new Date().toISOString().slice(0, 10);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(cfg.rateSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(date + ':' + subject));
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}
function clientNetwork(request: Request): string {
  // Supabase's gateway must supply/overwrite this header. It is only a guardrail:
  // the DB also has a global budget, so forged IPs cannot bypass that budget.
  return 'network:' + ((request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim().slice(0, 80) || 'unknown');
}

export function createHandler(options: { env: Env; fetchImpl?: Fetcher }): (request: Request) => Promise<Response> {
  const fetcher = options.fetchImpl ?? fetch;
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('Origin'); let permitted = false;
    let headers = corsHeaders(origin, false);
    try {
      const cfg = config(options.env);
      permitted = origin !== null && cfg.allowedOrigins.has(origin);
      headers = corsHeaders(origin, permitted);
      if (origin && !permitted) throw new HttpError(403, 'ORIGIN_FORBIDDEN', 'This origin is not permitted.');
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

      const pathname = new URL(request.url).pathname;
      // Accept the full deployed path, and /big-match/... for local Edge routing.
      const prefix = '/functions/v1/big-match';
      const route = pathname.startsWith(prefix + '/') ? pathname.slice(prefix.length)
        : pathname.startsWith('/big-match/') ? pathname.slice('/big-match'.length) : '';
      const match = /^\/events\/([^/]+)(?:\/(mind|me|contact))?\/?$/.exec(route);
      if (!match || !SLUG.test(match[1])) throw new HttpError(404, 'NOT_FOUND', 'This endpoint does not exist.');
      const slug = match[1]; const operation = match[2] ?? 'event';
      const method = request.method;
      const allowed = (operation === 'event' || operation === 'mind') ? ['GET']
        : operation === 'me' ? ['GET', 'PUT', 'DELETE'] : ['POST'];
      if (!allowed.includes(method)) throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported.');

      if (operation === 'me') {
        const actor = await getVerifiedUser(request, cfg, fetcher);
        // Gross request budget also bounds receipt replays without charging mutation quota.
        await rpc(cfg, fetcher, 'bm_read_guard', { p_rate_key: await rateKey(cfg, 'actor:' + actor) });
        if (method === 'GET') return json(await rpc(cfg, fetcher, 'bm_me', { p_slug: slug, p_actor_id: actor }), headers);
        const body = await readBody(request);
        if (method === 'DELETE') {
          fields(body, ['requestId']);
          return json(await rpc(cfg, fetcher, 'bm_delete', { p_slug: slug, p_actor_id: actor, p_request_id: requestId(body.requestId) }), headers);
        }
        fields(body, ['cardIds', 'requestId', 'expectedRevision']);
        if (!Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 0 || Number(body.expectedRevision) > 2147483646) {
          throw new HttpError(400, 'INVALID_REVISION', 'A valid revision is required.');
        }
        return json(await rpc(cfg, fetcher, 'bm_put', {
          p_slug: slug, p_actor_id: actor, p_card_ids: cardIds(body.cardIds),
          p_request_id: requestId(body.requestId), p_expected_revision: body.expectedRevision,
        }), headers);
      }

      const networkKey = await rateKey(cfg, clientNetwork(request));
      await rpc(cfg, fetcher, 'bm_read_guard', { p_rate_key: networkKey });
      if (operation === 'contact') {
        const body = await readBody(request);
        fields(body, ['email', 'name', 'privacyVersion', 'requestId', 'website']);
        const name = typeof body.name === 'string' ? body.name.trim().normalize('NFC') : '';
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if ((body.name !== undefined && typeof body.name !== 'string') || name.length > 120 ||
            email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
            typeof body.privacyVersion !== 'string' || body.privacyVersion.length < 1 || body.privacyVersion.length > 80 ||
            (body.website !== undefined && body.website !== '')) {
          throw new HttpError(400, 'INVALID_CONTACT', 'Please check your email and the privacy notice.');
        }
        return json(await rpc(cfg, fetcher, 'bm_contact', {
          p_slug: slug, p_email: email, p_name: name || null, p_privacy_version: body.privacyVersion,
          p_request_id: requestId(body.requestId), p_rate_key: networkKey,
        }), headers);
      }
      const data = await rpc(cfg, fetcher, operation === 'mind' ? 'bm_mind' : 'bm_event', { p_slug: slug });
      if (operation === 'mind') {
        const version = data && typeof data === 'object' && 'version' in data ? data.version : null;
        if (typeof version !== 'number' || !Number.isSafeInteger(version)) throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Community data is not available.');
        const etag = 'W/"' + slug + '-' + String(version) + '"';
        headers.set('ETag', etag);
        headers.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
        if ((request.headers.get('If-None-Match') ?? '').split(',').map(v => v.trim()).includes(etag)) {
          return new Response(null, { status: 304, headers });
        }
      } else {
        headers.set('Cache-Control', 'public, max-age=15');
      }
      return json(data, headers);
    } catch (error) {
      const safe = error instanceof HttpError ? error : new HttpError(503, 'SERVICE_UNAVAILABLE', 'The community service is temporarily unavailable.');
      headers.set('Cache-Control', 'no-store');
      if (safe.status === 429) headers.set('Retry-After', '60');
      return json({ error: { code: safe.code, message: safe.message } }, headers, safe.status);
    }
  };
}
