import type { MindSnapshot } from './types.ts';

export type Trio = readonly [number, number, number];
export interface RecordedParticipation { id: string; cardIds: readonly number[] }

const IDENTIFIER = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const EPOCH = '1970-01-01T00:00:00.000Z';

function assertIdentifier(value: string, label: string): void {
  if (typeof value !== 'string' || value.length > 64 || IDENTIFIER.exec(value)?.[0] !== value) {
    throw new TypeError(`${label} must be a lowercase identifier of at most 64 characters.`);
  }
}

/** Return a fresh, sorted trio. Never change the caller's selection order. */
export function canonicalTrio(ids: readonly number[], validIds?: ReadonlySet<number>): Trio {
  if (!Array.isArray(ids) || ids.length !== 3) {
    throw new TypeError('Choose exactly three cards.');
  }
  const sorted = [...ids];
  if (sorted.some(id => !Number.isSafeInteger(id) || id < 1)) {
    throw new TypeError('Card IDs must be positive safe integers.');
  }
  sorted.sort((a, b) => a - b);
  if (sorted[0] === sorted[1] || sorted[1] === sorted[2]) {
    throw new TypeError('Choose three different cards.');
  }
  if (validIds && sorted.some(id => !validIds.has(id))) {
    throw new RangeError('A selected card is unavailable in this catalogue.');
  }
  return Object.freeze([sorted[0]!, sorted[1]!, sorted[2]!] as const);
}

/** Deck-qualified identity for an unordered combination, not a visitor ID. */
export function combinationKey(deckVersion: string, ids: readonly number[]): string {
  assertIdentifier(deckVersion, 'Deck version');
  return `${deckVersion}/${canonicalTrio(ids).join('-')}`;
}

/**
 * One-based combinadic rank: C(a−1,1) + C(b−1,2) + C(c−1,3) + 1.
 * Appending new stable IDs never changes an existing combination's code.
 * BigInt prevents intermediate rounding; callers receive a safe JS number.
 */
export function combinationNumber(ids: readonly number[]): number {
  const [a, b, c] = canonicalTrio(ids).map(id => BigInt(id));
  const rank = (a! - 1n)
    + ((b! - 1n) * (b! - 2n)) / 2n
    + ((c! - 1n) * (c! - 2n) * (c! - 3n)) / 6n
    + 1n;
  if (rank > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Combination code exceeds the supported numeric range.');
  }
  return Number(rank);
}

function checkedParticipations(all: readonly RecordedParticipation[]): { id: string; cardIds: Trio }[] {
  const seen = new Set<string>();
  return all.map(participation => {
    if (!participation || typeof participation.id !== 'string' || !participation.id.trim()) {
      throw new TypeError('Each participation requires a nonempty ID.');
    }
    if (seen.has(participation.id)) throw new TypeError('Duplicate participation ID.');
    seen.add(participation.id);
    return { id: participation.id, cardIds: canonicalTrio(participation.cardIds) };
  });
}

/** Count other people once each: exact = 3 common cards; close = exactly 2. */
export function computeMatches(
  all: readonly RecordedParticipation[],
  ownId: string,
): { exact: number; close: number } {
  const rows = checkedParticipations(all);
  const own = rows.find(row => row.id === ownId);
  if (!own) return { exact: 0, close: 0 };
  const chosen = new Set(own.cardIds);
  let exact = 0;
  let close = 0;
  for (const row of rows) {
    if (row.id === ownId) continue;
    const common = row.cardIds.reduce((count, id) => count + Number(chosen.has(id)), 0);
    if (common === 3) exact++;
    else if (common === 2) close++;
  }
  return { exact, close };
}

/**
 * Pure aggregate oracle for recorded rows. The epoch default is intentional:
 * real API producers must pass their actual coherent snapshot timestamp.
 */
export function computeMind(
  all: readonly RecordedParticipation[],
  version = 0,
  asOf = EPOCH,
): MindSnapshot {
  if (!Number.isSafeInteger(version) || version < 0) throw new TypeError('Invalid snapshot version.');
  if (typeof asOf !== 'string' || !Number.isFinite(Date.parse(asOf))) {
    throw new TypeError('Invalid snapshot timestamp.');
  }
  const rows = checkedParticipations(all);
  const cardCounts: Record<string, number> = {};
  const pairCounts: Record<string, number> = {};
  for (const { cardIds } of rows) {
    const [a, b, c] = cardIds;
    for (const id of cardIds) cardCounts[id] = (cardCounts[id] ?? 0) + 1;
    for (const pair of [`${a}-${b}`, `${a}-${c}`, `${b}-${c}`]) {
      pairCounts[pair] = (pairCounts[pair] ?? 0) + 1;
    }
  }
  return { total: rows.length, cardCounts, pairCounts, version, asOf };
}

/** A share route describes a combination and never authorizes a write. */
export function buildResultHash(
  eventSlug: string,
  deckVersion: string,
  ids: readonly number[],
): string {
  assertIdentifier(eventSlug, 'Event slug');
  assertIdentifier(deckVersion, 'Deck version');
  return `#/r/${eventSlug}/${deckVersion}/${canonicalTrio(ids).join('-')}`;
}

/**
 * Accept only the exact canonical route, expected event/deck and known cards.
 * No decoding, leading zeroes, trailing data or alternative order is accepted.
 */
export function parseResultHash(
  hash: string,
  validIds: ReadonlySet<number>,
  expectedEvent: string,
  expectedDeck: string,
): number[] | null {
  if (typeof hash !== 'string' || hash.length > 256) return null;
  const match = /^#\/r\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\/([1-9]\d*)-([1-9]\d*)-([1-9]\d*)$/.exec(hash);
  if (!match || match[1] !== expectedEvent || match[2] !== expectedDeck) return null;
  try {
    const trio = canonicalTrio([Number(match[3]), Number(match[4]), Number(match[5])], validIds);
    if (buildResultHash(expectedEvent, expectedDeck, trio) !== hash) return null;
    return [...trio];
  } catch {
    return null;
  }
}
