import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventConfig, MindSnapshot, ParticipationAck, PendingParticipation, PersonalResult } from './types.ts';
import { isAck, isEventConfig, isMindSnapshot, isPersonalResult } from './validation.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 0, code = 'NETWORK_ERROR') {
    super(message); this.name = 'ApiError'; this.status = status; this.code = code;
  }
}

export interface ApiOptions { url: string; key: string; eventSlug: string }
function safePublicKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return false;
  if (key.startsWith('sb_publishable_')) return true;
  try { return JSON.parse(atob(key.split('.')[1])).role === 'anon'; } catch { return false; }
}

export class BigMatchApi {
  readonly configured: boolean;
  readonly configurationError: string | null;
  private readonly client: SupabaseClient | null;
  private readonly endpoint: string;
  private readonly key: string;
  private authPromise: Promise<string> | null = null;

  constructor({ url, key, eventSlug }: ApiOptions) {
    let usable = false;
    try { const parsed = new URL(url); usable = !parsed.username && !parsed.password && (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) && safePublicKey(key); } catch { /* Local composition stays available. */ }
    this.configured = usable;
    this.configurationError = url || key ? (usable ? null : 'The community connection is not configured correctly.') : null;
    this.key = key;
    this.endpoint = usable ? `${url.replace(/\/$/, '')}/functions/v1/big-match/events/${encodeURIComponent(eventSlug)}` : '';
    this.client = usable ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: `big-match-auth:${new URL(url).hostname}` },
      global: { fetch: timedFetch },
    }) : null;
  }

  async hasSession(): Promise<boolean> {
    if (!this.client) return false;
    const { data, error } = await this.client.auth.getSession();
    if (error) throw new ApiError('Your browser session could not be restored.', 401, 'SESSION_EXPIRED');
    return Boolean(data.session);
  }

  private async token(create: boolean): Promise<string> {
    if (!this.client) throw new ApiError('Community matching is not available yet.', 503, 'NOT_CONFIGURED');
    if (!this.authPromise) {
      const client = this.client;
      this.authPromise = (async () => {
        const { data, error } = await client.auth.getSession();
        if (error) throw new ApiError('Your browser session could not be restored.', 401, 'SESSION_EXPIRED');
        if (data.session) return data.session.access_token;
        if (!create) throw new ApiError('No participation is linked to this browser yet.', 401, 'NO_SESSION');
        const signed = await client.auth.signInAnonymously();
        if (signed.error || !signed.data.session) {
          const limited = signed.error?.status === 429;
          throw new ApiError(limited ? 'The event is busy. Please try again shortly.' : 'We could not open your private browser session. Please try again.', signed.error?.status || 503, limited ? 'RATE_LIMITED' : 'AUTH_UNAVAILABLE');
        }
        return signed.data.session.access_token;
      })();
    }
    try { return await this.authPromise; } finally { this.authPromise = null; }
  }

  private async request<T>(path = '', options: { method?: string; body?: unknown; auth?: boolean; createSession?: boolean } = {}): Promise<T> {
    if (!this.configured) throw new ApiError('Community matching is not available yet.', 503, 'NOT_CONFIGURED');
    const headers: Record<string, string> = { apikey: this.key, Accept: 'application/json' };
    if (options.auth) headers.Authorization = `Bearer ${await this.token(options.createSession ?? true)}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    let response: Response;
    try { response = await timedFetch(this.endpoint + path, { method: options.method || 'GET', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), cache: options.auth || (options.method && options.method !== 'GET') ? 'no-store' : 'default', credentials: 'omit' }); }
    catch { throw new ApiError('The connection was interrupted. Your composition is still here.'); }
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new ApiError('The community returned an unreadable response. Please try again.', 502, 'INVALID_RESPONSE'); }
    if (!response.ok) {
      const error = (payload as { error?: { code?: string; message?: string } })?.error;
      // API error bodies are controlled JSON; UI always inserts this as plain text.
      throw new ApiError(error?.message || 'The request could not be completed.', response.status, error?.code || 'API_ERROR');
    }
    return payload as T;
  }

  async event(): Promise<EventConfig> {
    const value = await this.request<EventConfig>();
    if (!isEventConfig(value)) throw new ApiError('The event configuration is incomplete.', 502, 'INVALID_RESPONSE');
    return value;
  }
  async mind(): Promise<MindSnapshot> { const value = await this.request('/mind'); if (!isMindSnapshot(value)) throw new ApiError('The community counts could not be verified. Please refresh.', 502, 'INVALID_RESPONSE'); return value; }
  async mine(createSession = true): Promise<PersonalResult> { const value = await this.request('/me', { auth: true, createSession }); if (!isPersonalResult(value)) throw new ApiError('Your connections could not be verified. Please refresh.', 502, 'INVALID_RESPONSE'); return value; }
  async save(body: PendingParticipation): Promise<ParticipationAck> { const value = await this.request('/me', { auth: true, method: 'PUT', body }); if (!isAck(value) || value.requestId !== body.requestId || value.cardIds.join('-') !== [...body.cardIds].sort((a,b)=>a-b).join('-')) throw new ApiError('The response could not be confirmed. Please try again.', 502, 'INVALID_RESPONSE'); return value; }
  async erase(requestId: string): Promise<{ deleted: true }> { const value = await this.request<{ deleted?: unknown }>('/me', { auth: true, createSession: false, method: 'DELETE', body: { requestId } }); if (!value || value.deleted !== true) throw new ApiError('The deletion could not be confirmed. Please try again.', 502, 'INVALID_RESPONSE'); return { deleted: true }; }
  async contact(body: { email: string; name?: string; privacyVersion: string; requestId: string; website: string }): Promise<{ saved: true; requestId: string }> { const value = await this.request<{ saved?: unknown; requestId?: unknown }>('/contact', { method: 'POST', body }); if (!value || value.saved !== true || value.requestId !== body.requestId) throw new ApiError('The catalogue request could not be confirmed. Please try again.', 502, 'INVALID_RESPONSE'); return { saved: true, requestId: body.requestId }; }
  async forgetSession(): Promise<void> {
    if (this.client) {
      const { error } = await this.client.auth.signOut({ scope: 'local' });
      if (error) throw new ApiError('Your response was deleted, but the browser session could not be cleared. Reload before participating again.', 503, 'LOCAL_SIGNOUT_FAILED');
    }
  }
}

export async function timedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const relay = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) relay(); else init.signal?.addEventListener('abort', relay, { once: true });
  const timer = setTimeout(() => controller.abort(), 12_000);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); init.signal?.removeEventListener('abort', relay); }
}
