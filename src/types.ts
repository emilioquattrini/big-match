export interface Card { id: number; slug: string; name: string; image: string; alt: string; ordinal: number }
export interface Catalogue { deckVersion: string; cards: Card[] }
export interface EventConfig { slug: string; title: string; question: string; deckVersion: string; status: 'draft' | 'open' | 'closed'; activeCardIds: number[]; contactEnabled: boolean; privacyVersion: string; privacyNotice: string; controllerName: string; controllerEmail: string; retentionDays: number }
export interface ParticipationAck { participationId: string; revision: number; requestId: string; cardIds: [number, number, number]; updatedAt: string }
export interface MindSnapshot { total: number; cardCounts: Record<string, number>; pairCounts: Record<string, number>; version: number; asOf: string }
export interface PersonalResult { participation: ParticipationAck | null; matches: { exact: number; close: number } | null; mind: MindSnapshot }
export interface PendingParticipation { cardIds: [number, number, number]; requestId: string; expectedRevision: number }
