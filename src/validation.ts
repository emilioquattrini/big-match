import type { EventConfig, MindSnapshot, ParticipationAck, PersonalResult } from './types.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const string = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const date = (v: unknown): v is string => string(v, 64) && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
const id = (v: unknown): v is number => integer(v) && v > 0 && v <= 1000;
function validTrio(v: unknown): v is [number, number, number] { return Array.isArray(v) && v.length === 3 && v.every(id) && v[0] < v[1] && v[1] < v[2]; }
export function isAck(v: unknown): v is ParticipationAck {
  return object(v) && typeof v.participationId === 'string' && UUID.test(v.participationId) && typeof v.requestId === 'string' && UUID.test(v.requestId) && integer(v.revision) && v.revision > 0 && validTrio(v.cardIds) && date(v.updatedAt);
}
export function isEventConfig(v: unknown): v is EventConfig {
  return object(v) && string(v.slug, 80) && SLUG.test(v.slug) && string(v.deckVersion,64) && SLUG.test(v.deckVersion) && string(v.title,300) && string(v.question,500) && typeof v.status === 'string' && ['draft','open','closed'].includes(v.status) && Array.isArray(v.activeCardIds) && v.activeCardIds.length >= 3 && v.activeCardIds.length <= 1000 && v.activeCardIds.every(id) && new Set(v.activeCardIds).size === v.activeCardIds.length && typeof v.contactEnabled === 'boolean' && string(v.privacyVersion,100) && string(v.privacyNotice,30000) && string(v.controllerName,300) && string(v.controllerEmail,254) && integer(v.retentionDays);
}
export function isMindSnapshot(v: unknown): v is MindSnapshot {
  if (!object(v) || !integer(v.total) || !integer(v.version) || !date(v.asOf) || !object(v.cardCounts) || !object(v.pairCounts)) return false;
  const cardEntries = Object.entries(v.cardCounts), pairEntries = Object.entries(v.pairCounts);
  if (cardEntries.length > 1000 || pairEntries.length > 499500) return false;
  if (!cardEntries.every(([key,n]) => /^[1-9]\d{0,3}$/.test(key) && id(Number(key)) && integer(n) && n <= (v.total as number))) return false;
  if (!pairEntries.every(([key,n]) => { const pair = key.split('-').map(Number); return /^[1-9]\d{0,3}-[1-9]\d{0,3}$/.test(key) && pair.length === 2 && pair.every(id) && pair[0] < pair[1] && integer(n) && n <= (v.total as number); })) return false;
  return cardEntries.reduce((sum,[,n]) => sum + (n as number),0) === 3 * v.total && pairEntries.reduce((sum,[,n]) => sum + (n as number),0) === 3 * v.total;
}
export function isPersonalResult(v: unknown): v is PersonalResult {
  if (!object(v) || !isMindSnapshot(v.mind)) return false;
  if (v.participation === null) return v.matches === null;
  return isAck(v.participation) && object(v.matches) && integer(v.matches.exact) && integer(v.matches.close) && v.matches.exact + v.matches.close <= v.mind.total - 1;
}
