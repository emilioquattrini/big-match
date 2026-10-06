import type { BrowserContext, Route } from '@playwright/test';
import type { EventConfig, MindSnapshot, ParticipationAck, PendingParticipation } from '../../src/types.ts';

export const FIXTURE_ORIGIN = 'https://big-match-test.supabase.co';
export const FIXTURE_KEY = 'sb_publishable_e2e_fixture_only_000000000000';
const actorId = '11111111-1111-4111-8111-111111111111';
const participationId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-10-06T12:00:00Z';

/** Browser transport fixture, never a database substitute. SQL invariants have separate tests. */
export class EventFixture {
  config: EventConfig = {
    slug: 'big-2026', title: 'BIG MATCH — Browser fixture',
    question: 'What does the future of design look like?', deckVersion: 'impersonae-v1',
    status: 'open', activeCardIds: Array.from({ length: 13 }, (_, i) => i + 1),
    contactEnabled: false, privacyVersion: 'fixture-v1',
    privacyNotice: 'Test fixture: technical participation and optional catalogue requests are separate.',
    controllerName: 'Test Controller', controllerEmail: 'controller@example.invalid', retentionDays: 60,
  };
  ack: ParticipationAck | null = null;
  matches = { exact: 0, close: 0 };
  snapshot: MindSnapshot | null = null;
  putBodies: PendingParticipation[] = [];
  contactBodies: Array<{ email: string; name?: string; privacyVersion: string; requestId: string; website?: string }> = [];
  unexpectedRequests: string[] = [];
  diagnostics: Array<{ phase: string; method: string; origin: string; path: string; status?: number; failure?: string }> = [];
  authSignups = 0;
  committedWrites = 0;
  deleteCalls = 0;
  loseNextPutResponse = false;
  conflictNextPut = false;
  failContacts = 0;
  failDeletes = 0;
  holdNextPersonalRead = false;
  private heldPersonalReads: Array<{ route: Route; value: unknown }> = [];
  private receipts = new Map<string, ParticipationAck>();
  private deleted = false;
  private browserOrigin = '';

  get heldReads(): number { return this.heldPersonalReads.length; }
  async releasePersonalReads(): Promise<void> {
    const reads = this.heldPersonalReads.splice(0);
    await Promise.all(reads.map(({ route, value }) => this.json(route, value)));
  }

  async install(context: BrowserContext, baseURL: string): Promise<void> {
    this.browserOrigin = new URL(baseURL).origin;
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname)) throw new Error('Fixture tests require a local app.');
    // Record transport outcomes only: no headers, tokens, bodies, query strings or contact details.
    context.on('response', response => {
      const url = new URL(response.url());
      this.diagnostics.push({ phase: 'response', method: response.request().method(), origin: url.origin, path: url.pathname, status: response.status() });
    });
    context.on('requestfailed', request => {
      const url = new URL(request.url());
      this.diagnostics.push({ phase: 'failed', method: request.method(), origin: url.origin, path: url.pathname, failure: request.failure()?.errorText });
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (!['http:', 'https:'].includes(url.protocol) || url.origin === this.browserOrigin) return route.continue();
      if (url.origin !== FIXTURE_ORIGIN) {
        this.unexpectedRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
        return route.abort('blockedbyclient');
      }
      await this.handle(route, url);
    });
  }

  private json(route: Route, body: unknown, status = 200): Promise<void> {
    return route.fulfill({ status, body: status === 204 ? '' : JSON.stringify(body), headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': this.browserOrigin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    } });
  }

  private mind(): MindSnapshot {
    if (this.snapshot) return this.snapshot;
    const ids = this.ack?.cardIds || [];
    return { total: this.ack ? 1 : 0, cardCounts: Object.fromEntries(ids.map(id => [String(id), 1])),
      pairCounts: ids.length === 3 ? { [`${ids[0]}-${ids[1]}`]: 1, [`${ids[0]}-${ids[2]}`]: 1, [`${ids[1]}-${ids[2]}`]: 1 } : {},
      version: this.committedWrites, asOf: timestamp };
  }

  private async handle(route: Route, url: URL): Promise<void> {
    const request = route.request(), method = request.method();
    if (method === 'OPTIONS') return this.json(route, null, 204);
    if (url.pathname === '/auth/v1/signup' && method === 'POST') {
      this.authSignups++;
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const claims = { sub: actorId, aud: 'authenticated', role: 'authenticated', is_anonymous: true, exp: expiresAt };
      const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture_signature`;
      return this.json(route, { access_token: jwt, refresh_token: 'fixture-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt,
        user: { id: actorId, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, identities: [], created_at: timestamp } });
    }
    if (url.pathname === '/auth/v1/logout' && method === 'POST') return this.json(route, null, 204);
    const eventPath = '/functions/v1/big-match/events/big-2026';
    if (url.pathname === eventPath && method === 'GET') return this.json(route, this.config);
    if (url.pathname === eventPath + '/mind' && method === 'GET') return this.json(route, this.mind());
    if (url.pathname === eventPath + '/me') {
      if (!request.headers()['authorization']?.startsWith('Bearer ')) return this.json(route, { error: { code: 'UNAUTHORIZED', message: 'Session required.' } }, 401);
      if (this.deleted && method !== 'DELETE') return this.json(route, { error: { code: 'BM_DELETED', message: 'This participation was deleted.' } }, 410);
      if (method === 'GET') {
        const value = structuredClone({ participation: this.ack, matches: this.ack ? this.matches : null, mind: this.mind() });
        if (this.holdNextPersonalRead) { this.holdNextPersonalRead = false; this.heldPersonalReads.push({ route, value }); return; }
        return this.json(route, value);
      }
      if (method === 'PUT') {
        const body = request.postDataJSON() as PendingParticipation;
        this.putBodies.push(structuredClone(body));
        if (this.conflictNextPut) {
          this.conflictNextPut = false;
          this.ack = { participationId, requestId: '33333333-3333-4333-8333-333333333333', cardIds: [1, 2, 4], revision: 2, updatedAt: timestamp };
          return this.json(route, { error: { code: 'BM_REVISION_CONFLICT', message: 'A newer revision exists.' } }, 409);
        }
        const prior = this.receipts.get(body.requestId);
        if (prior) return this.json(route, prior);
        this.ack = { participationId, requestId: body.requestId, cardIds: [...body.cardIds].sort((a,b) => a-b) as [number,number,number], revision: (this.ack?.revision || 0) + 1, updatedAt: timestamp };
        this.receipts.set(body.requestId, structuredClone(this.ack));
        this.committedWrites++;
        if (this.loseNextPutResponse) { this.loseNextPutResponse = false; return route.abort('failed'); }
        return this.json(route, this.ack);
      }
      if (method === 'DELETE') {
        this.deleteCalls++;
        if (this.failDeletes-- > 0) return this.json(route, { error: { code: 'UNAVAILABLE', message: 'Deletion is temporarily unavailable. Try again.' } }, 503);
        this.ack = null; this.deleted = true;
        return this.json(route, { deleted: true });
      }
    }
    if (url.pathname === eventPath + '/contact' && method === 'POST') {
      const body = request.postDataJSON(); this.contactBodies.push(structuredClone(body));
      if (this.failContacts-- > 0) return this.json(route, { error: { code: 'UNAVAILABLE', message: 'The request could not be saved. Please try again.' } }, 503);
      return this.json(route, { saved: true, requestId: body.requestId });
    }
    this.unexpectedRequests.push(`${method} ${url.pathname}`);
    return this.json(route, { error: { code: 'FIXTURE_ROUTE_MISSING', message: 'Unexpected fixture request.' } }, 500);
  }
}
