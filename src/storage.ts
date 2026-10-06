import type { ParticipationAck, PendingParticipation } from './types.ts';

export interface SavedState {
  selectedIds: number[];
  resultIds: number[] | null;
  ack: ParticipationAck | null;
  pending: PendingParticipation | null;
}
export const emptyState = (): SavedState => ({ selectedIds: [], resultIds: null, ack: null, pending: null });
export const stateKey = (event: string, deck: string) => `big-match:v1:${event}:${deck}`;
type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem' | 'removeItem'>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.exec(value)?.[0] === value;
const isId = (id: unknown, valid: ReadonlySet<number>): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0 && valid.has(id);

/** Accept the RFC3339 timestamps returned by PostgreSQL, including +00:00 and microseconds. */
function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || match[0] !== value || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!
    && Number(match[4]) < 24 && Number(match[5]) < 60 && Number(match[6]) < 60;
}
function ids(value: unknown, valid: ReadonlySet<number>, exact = false): value is number[] {
  return Array.isArray(value) && value.length <= 3 && (!exact || value.length === 3) && value.every(id => isId(id, valid)) && new Set(value).size === value.length;
}
function ack(value: unknown, valid: ReadonlySet<number>): value is ParticipationAck {
  if (!value || typeof value !== 'object') return false;
  const v = value as ParticipationAck;
  return isUuid(v.participationId) && isUuid(v.requestId) && Number.isSafeInteger(v.revision) && v.revision > 0 && ids(v.cardIds, valid, true) && isTimestamp(v.updatedAt);
}
function pending(value: unknown, valid: ReadonlySet<number>): value is PendingParticipation {
  if (!value || typeof value !== 'object') return false;
  const v = value as PendingParticipation;
  return isUuid(v.requestId) && Number.isSafeInteger(v.expectedRevision) && v.expectedRevision >= 0 && ids(v.cardIds, valid, true);
}
export function loadState(storage: Reader | null, key: string, valid: ReadonlySet<number>): SavedState {
  try {
    const raw = storage?.getItem(key);
    if (!raw || raw.length > 10_000) return emptyState();
    const v = JSON.parse(raw);
    return {
      selectedIds: ids(v.selectedIds, valid) ? v.selectedIds : [],
      resultIds: ids(v.resultIds, valid, true) ? v.resultIds : null,
      ack: ack(v.ack, valid) ? v.ack : null,
      pending: pending(v.pending, valid) ? v.pending : null,
    };
  } catch { return emptyState(); }
}
export function saveState(storage: Writer | null, key: string, value: SavedState): boolean {
  try { if (!storage) return false; storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function clearState(storage: Writer | null, key: string): boolean {
  try { if (!storage) return false; storage.removeItem(key); return true; } catch { return false; }
}
export function browserStorage(): Storage | null { try { return window.localStorage; } catch { return null; } }
