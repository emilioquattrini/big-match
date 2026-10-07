import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Catalogue } from '../src/types.ts';
import {
  buildResultHash, canonicalTrio, combinationKey, combinationNumber,
  computeMatches, computeMind, parseResultHash,
} from '../src/domain.ts';

const validIds = new Set(Array.from({ length: 13 }, (_, index) => index + 1));
const event = 'big-2026';
const deck = 'impersonae-v1';

function* triples(size: number): Generator<[number, number, number]> {
  for (let a = 1; a <= size; a++) {
    for (let b = a + 1; b <= size; b++) {
      for (let c = b + 1; c <= size; c++) yield [a, b, c];
    }
  }
}

test('canonical trios validate distinct enabled IDs without mutating the selection', () => {
  const selected = [13, 1, 7];
  const result = canonicalTrio(selected, validIds);
  assert.deepEqual(result, [1, 7, 13]);
  assert.deepEqual(selected, [13, 1, 7]);
  assert.ok(Object.isFrozen(result));
  for (const invalid of [[], [1, 2], [1, 2, 3, 4], [1, 1, 2], [0, 1, 2], [1, -2, 3], [1, 2.5, 3], [1, 2, NaN], [1, 2, Infinity], [1, 2, 14], [1, 2, Number.MAX_SAFE_INTEGER + 1]]) {
    assert.throws(() => canonicalTrio(invalid, validIds));
  }
  assert.throws(() => canonicalTrio([1, , 3] as number[]));
});

test('all 286 current combinations have distinct codes and exact strict-route round trips', () => {
  const codes = new Set<number>();
  for (const trio of triples(13)) {
    const code = combinationNumber(trio);
    assert.equal(codes.has(code), false, `Duplicate code ${code} for ${trio}`);
    codes.add(code);
    assert.deepEqual(parseResultHash(buildResultHash(event, deck, trio), validIds, event, deck), trio);
  }
  assert.equal(codes.size, 286);
  assert.equal(Math.min(...codes), 1);
  assert.equal(Math.max(...codes), 286);
  assert.notEqual(combinationNumber([1, 2, 5]), combinationNumber([1, 3, 4]), 'The original #0496 collision is removed.');
});

test('a 52-card extension has 22,100 distinct stable codes', () => {
  const existing = new Map([...triples(13)].map(trio => [trio.join('-'), combinationNumber(trio)]));
  const codes = new Set<number>();
  for (const trio of triples(52)) {
    const number = combinationNumber(trio);
    assert.equal(codes.has(number), false);
    codes.add(number);
    if (existing.has(trio.join('-'))) assert.equal(number, existing.get(trio.join('-')));
  }
  assert.equal(codes.size, 22_100);
  assert.equal(Math.min(...codes), 1);
  assert.equal(Math.max(...codes), 22_100);
});

test('combination identity ignores tap order and numeric overflow fails explicitly', () => {
  for (const trio of [[1, 7, 13], [1, 13, 7], [7, 1, 13], [7, 13, 1], [13, 1, 7], [13, 7, 1]]) {
    assert.equal(combinationNumber(trio), combinationNumber([1, 7, 13]));
    assert.equal(combinationKey(deck, trio), 'impersonae-v1/1-7-13');
  }
  assert.throws(() => combinationNumber([1, 2, Number.MAX_SAFE_INTEGER]), RangeError);
  assert.throws(() => combinationKey('impersonae-v1\n', [1, 2, 3]));
  assert.throws(() => buildResultHash('../big-2026', deck, [1, 2, 3]));
});

test('shared routes reject wrong events/decks, unknown IDs and noncanonical or encoded data', () => {
  const valid = '#/r/big-2026/impersonae-v1/1-2-3';
  assert.deepEqual(parseResultHash(valid, validIds, event, deck), [1, 2, 3]);
  const invalid = [
    '', '#', '#/r/big-2027/impersonae-v1/1-2-3', '#/r/big-2026/impersonae-v2/1-2-3',
    '#/r/big-2026/impersonae-v1/1-2-14', '#/r/big-2026/impersonae-v1/1-2-2',
    '#/r/big-2026/impersonae-v1/3-2-1', '#/r/big-2026/impersonae-v1/01-2-3',
    '#/r/big-2026/impersonae-v1/1-2-3.0', '#/r/big-2026/impersonae-v1/1-2-9007199254740993',
    '#/r/big-2026/impersonae-v1/1-2-%33', '#/r/big-2026/impersonae-v1/1%2D2%2D3',
    `${valid}/`, `${valid}\n`, `${valid}?save=true`, `${valid}#other`,
    `https://example.test/${valid}`, '#/r/BIG-2026/impersonae-v1/1-2-3',
    '#/r/big-2026/impersonae-v1/1-2-3-4', '#/r/big-2026/impersonae-v1/0-1-2',
  ];
  for (const hash of invalid) assert.equal(parseResultHash(hash, validIds, event, deck), null, hash);
  assert.equal(parseResultHash(valid, new Set([1, 2]), event, deck), null);
});

const participants = [
  { id: 'own', cardIds: [1, 2, 3] },
  { id: 'other-abc', cardIds: [3, 2, 1] },
  { id: 'abd', cardIds: [1, 2, 4] },
  { id: 'acd', cardIds: [1, 3, 4] },
  { id: 'bcd', cardIds: [2, 3, 4] },
  { id: 'aef', cardIds: [1, 5, 6] },
  { id: 'def', cardIds: [4, 5, 6] },
];

test('reference ABC dataset counts other participants once: exact 1, close 3', () => {
  assert.deepEqual(computeMatches(participants, 'own'), { exact: 1, close: 3 });
  assert.deepEqual(computeMatches(participants.slice(0, 1), 'own'), { exact: 0, close: 0 });
  assert.deepEqual(computeMatches([], 'own'), { exact: 0, close: 0 });
  assert.deepEqual(computeMatches(participants, 'absent'), { exact: 0, close: 0 });
  assert.throws(() => computeMatches([...participants, participants[0]!], 'own'), /Duplicate/);
  assert.throws(() => computeMatches([{ id: 'bad', cardIds: [1, 1, 2] }], 'bad'));
});

test('mind aggregates contain only global counts and preserve the supplied snapshot version/time', () => {
  const snapshot = computeMind(participants, 42, '2026-10-06T20:00:00.000Z');
  assert.deepEqual(snapshot, {
    total: 7,
    cardCounts: { '1': 5, '2': 4, '3': 4, '4': 4, '5': 2, '6': 2 },
    pairCounts: { '1-2': 3, '1-3': 3, '2-3': 3, '1-4': 2, '2-4': 2, '3-4': 2, '1-5': 1, '1-6': 1, '5-6': 2, '4-5': 1, '4-6': 1 },
    version: 42,
    asOf: '2026-10-06T20:00:00.000Z',
  });
  assert.equal(Object.values(snapshot.cardCounts).reduce((sum, count) => sum + count, 0), snapshot.total * 3);
  assert.equal(Object.values(snapshot.pairCounts).reduce((sum, count) => sum + count, 0), snapshot.total * 3);
  assert.deepEqual(computeMind([], 0, snapshot.asOf), { total: 0, cardCounts: {}, pairCounts: {}, version: 0, asOf: snapshot.asOf });
  assert.throws(() => computeMind(participants, -1));
  assert.throws(() => computeMind(participants, 1, 'not a date'));
});

test('catalogue retains the original 13 names, stable IDs and actual app-relative assets', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../catalog/impersonae-v1.json', import.meta.url), 'utf8')) as Catalogue;
  assert.equal(catalogue.deckVersion, deck);
  assert.deepEqual(catalogue.cards.map(card => card.id), Array.from(validIds));
  assert.deepEqual(catalogue.cards.map(card => card.name), ['Cyborg', 'Diva', 'Exotic', 'Hypnotic', 'Juggler', 'Loyal', 'Mother', 'Nocturnal', 'Nostalgia', 'Oceanic', 'Otherthinker', 'Chimera', 'Emotional']);
  assert.equal(new Set(catalogue.cards.map(card => card.slug)).size, 13);
  for (const card of catalogue.cards) {
    assert.equal(card.ordinal, card.id);
    assert.equal(card.slug, card.name.toLowerCase());
    assert.equal(card.image, `cards/${card.slug}.jpg`);
    assert.ok(card.alt.includes(card.name));
    const bytes = readFileSync(new URL(`../public/${card.image}`, import.meta.url));
    assert.equal(bytes.subarray(0, 2).toString('hex'), 'ffd8');
    assert.equal(bytes.subarray(-2).toString('hex'), 'ffd9');
  }
  const logo = readFileSync(new URL('../public/brand/impersonae.png', import.meta.url));
  assert.equal(logo.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.deepEqual([logo.readUInt32BE(16), logo.readUInt32BE(20)], [700, 119]);
  // The original logo must remain byte-identical; resizing belongs to a derivative.
  assert.equal(createHash('sha256').update(logo).digest('hex'), '22b320056e0d54df7224c473a8aa16bcc258701fe0559d6b09b0b3cb151130bd');
});
