import test from 'node:test';
import assert from 'node:assert/strict';
import type { SavedState } from '../src/storage.ts';
import { browserStorage, clearState, emptyState, loadState, saveState, stateKey } from '../src/storage.ts';

const valid = new Set([1, 2, 3, 4]);
const key = stateKey('big-2026', 'impersonae-v1');
const firstRequest = '00000000-0000-4000-8000-000000000001';
const nextRequest = '00000000-0000-4000-8000-000000000002';
const confirmed: SavedState = {
  selectedIds: [4, 2, 1],
  resultIds: [1, 2, 4],
  ack: {
    participationId: '4bb5b99c-49eb-4421-9222-1f65ba4d9ab4',
    revision: 2,
    requestId: firstRequest,
    cardIds: [1, 2, 3],
    updatedAt: '2026-10-06T20:00:00.123456+00:00',
  },
  pending: { cardIds: [1, 2, 4], expectedRevision: 2, requestId: nextRequest },
};

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

function read(value: unknown): SavedState {
  return loadState({ getItem: () => JSON.stringify(value) }, key, valid);
}

test('storage round trip preserves the pending request identity, revision and edited selection', () => {
  const storage = new MemoryStorage();
  assert.equal(saveState(storage, key, confirmed), true);
  assert.deepEqual(loadState(storage, key, valid), confirmed);
  assert.notEqual(stateKey('big-2027', 'impersonae-v1'), key);
  assert.notEqual(stateKey('big-2026', 'impersonae-v2'), key);
  assert.equal(clearState(storage, key), true);
  assert.deepEqual(loadState(storage, key, valid), emptyState());
});

test('missing, blocked, corrupt, primitive and oversized storage never crash reload', () => {
  assert.deepEqual(loadState(null, key, valid), emptyState());
  assert.deepEqual(loadState({ getItem: () => { throw new DOMException('Blocked', 'SecurityError'); } }, key, valid), emptyState());
  for (const raw of ['', '{broken', 'null', '42', '"text"', '[]', 'x'.repeat(10_001)]) {
    assert.deepEqual(loadState({ getItem: () => raw }, key, valid), emptyState(), raw.slice(0, 30));
  }
});

test('invalid cached card IDs are discarded independently while valid editable state survives', () => {
  const recovered = read({
    ...confirmed,
    resultIds: [1, 2, 99],
    ack: { ...confirmed.ack, cardIds: [1, 1, 2] },
    pending: { ...confirmed.pending, cardIds: [1, 2, 0] },
  });
  assert.deepEqual(recovered, { selectedIds: [4, 2, 1], resultIds: null, ack: null, pending: null });
  for (const ids of [[1, 2, '3'], [1, 2, 3, 4], [1, 1], [1, 2.5, 3], [1, 2, null]]) {
    assert.deepEqual(read({ ...confirmed, selectedIds: ids }).selectedIds, []);
  }
});

test('corrupt ACK identities and pending UUIDs cannot be treated as saved or replayable data', () => {
  const invalidIds = ['', 'not-a-uuid', `12345678-${'-'.repeat(27)}`, `${firstRequest}\n`, '00000000-0000-4000-8000000000000001'];
  for (const requestId of invalidIds) {
    assert.equal(read({ ...confirmed, ack: { ...confirmed.ack, requestId } }).ack, null, requestId);
    assert.equal(read({ ...confirmed, pending: { ...confirmed.pending, requestId } }).pending, null, requestId);
  }
  for (const participationId of invalidIds) {
    assert.equal(read({ ...confirmed, ack: { ...confirmed.ack, participationId } }).ack, null, participationId);
  }
  assert.equal(read({ ...confirmed, ack: { ...confirmed.ack, revision: 0 } }).ack, null);
  assert.equal(read({ ...confirmed, pending: { ...confirmed.pending, expectedRevision: -1 } }).pending, null);
  assert.equal(read({ ...confirmed, pending: { ...confirmed.pending, expectedRevision: Number.MAX_SAFE_INTEGER + 1 } }).pending, null);
});

test('ACK timestamps accept PostgreSQL ISO output but reject invalid dates and arbitrary strings', () => {
  for (const updatedAt of ['2026-10-06T20:00:00Z', '2026-10-06T20:00:00.000Z', '2026-10-06T20:00:00.123456+00:00', '2026-10-06T22:00:00+02:00', '2024-02-29T20:00:00Z']) {
    assert.equal(read({ ...confirmed, ack: { ...confirmed.ack, updatedAt } }).ack?.updatedAt, updatedAt);
  }
  for (const updatedAt of ['', 'not-a-date', '2026-10-06', '2026-02-29T20:00:00Z', '2026-02-30T20:00:00Z', '2026-10-06T24:00:00Z', '2026-10-06T20:60:00Z', '2026-10-06T20:00:00Z\n']) {
    assert.equal(read({ ...confirmed, ack: { ...confirmed.ack, updatedAt } }).ack, null, updatedAt);
  }
});

test('quota and blocked storage errors are reported without claiming a successful write or erase', () => {
  const blocked = {
    setItem: () => { throw new DOMException('Quota reached', 'QuotaExceededError'); },
    removeItem: () => { throw new DOMException('Storage blocked', 'SecurityError'); },
  };
  assert.equal(saveState(blocked, key, confirmed), false);
  assert.equal(saveState(null, key, confirmed), false);
  assert.equal(clearState(blocked, key), false);
  assert.equal(clearState(null, key), false);
});

test('browserStorage tolerates a disabled window.localStorage getter', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: Object.defineProperty({}, 'localStorage', { get: () => { throw new DOMException('Blocked', 'SecurityError'); } }),
  });
  try { assert.equal(browserStorage(), null); }
  finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
