/** Small pure helpers for turning log entries into steps: defensive readers of event data, labels, and table lookups. */
import type { Card, ClientGameState, ContestedAction, PlayerBoard, PropertyColor, PropertySet } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import type { MomentKind } from '../../moments/types';
import { theme } from '../../theme';

// ── reading data defensively ─────────────────────────────────────────────────

export const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
export const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
export const strs = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : undefined);
export const colorOf = (v: unknown): PropertyColor | undefined => (typeof v === 'string' && v in SET_SIZES ? (v as PropertyColor) : undefined);
export function contestedOf(v: unknown): ContestedAction | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const c = v as Partial<ContestedAction>;
  if (typeof c.type !== 'string' || typeof c.actorId !== 'string') return undefined;
  return { ...c, type: c.type, actorId: c.actorId, payload: c.payload && typeof c.payload === 'object' ? c.payload : {} };
}

export const money = (n: number) => theme.formatMoney(n);
export const actionLabel = (type: string | undefined) => (!type ? 'play' : type === 'rent' ? 'Rent' : (theme.actionNames[type] ?? 'play'));
export const isJsn = (c: Card | null | undefined): c is Card => !!c && c.kind === 'action' && c.action === 'just_say_no';
/** Whether a card is the action (or Rent) of that contested/played type. */
export const isType = (c: Card | null | undefined, type: string): c is Card => !!c && (type === 'rent' ? c.kind === 'rent' : c.kind === 'action' && c.action === type);
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The face of a contested action's type, for a slam whose real card is no longer to be found. */
export const KIND_OF_TYPE: Record<string, MomentKind | undefined> = {
  sly_deal: 'sly_deal',
  forced_deal: 'forced_deal',
  deal_breaker: 'deal_breaker',
  debt_collector: 'debt_collector',
  its_my_birthday: 'birthday',
  rent: 'rent',
  just_say_no: 'just_say_no',
};

// ── finding cards ────────────────────────────────────────────────────────────

interface Found {
  card: Card;
  owner: string;
  kind: 'bank' | 'card' | 'house' | 'hotel';
  set?: PropertySet;
}

export function boardsOf(st: ClientGameState): { id: string; board: PlayerBoard }[] {
  return [
    ...st.players.filter((p) => p.id === st.viewerId),
    ...st.players.filter((p) => p.id !== st.viewerId),
  ].map((p) => ({ id: p.id, board: p.board }));
}

/** A card on the public table (any bank or set, buildings included), with whose it is and which set holds it. */
export function locate(st: ClientGameState, cardId: string | undefined): Found | undefined {
  if (!cardId) return undefined;
  for (const { id: owner, board } of boardsOf(st)) {
    for (const c of board.bank) if (c.id === cardId) return { card: c, owner, kind: 'bank' };
    for (const set of board.sets) {
      for (const c of set.cards) if (c.id === cardId) return { card: c, owner, kind: 'card', set };
      if (set.house?.id === cardId) return { card: set.house, owner, kind: 'house', set };
      if (set.hotel?.id === cardId) return { card: set.hotel, owner, kind: 'hotel', set };
    }
  }
  return undefined;
}

/** What a seat could pay with right now: its bank, its properties and their buildings, by value (-1 when the seat is unknown). */
export function tableAssets(st: ClientGameState, owner: string): number {
  const b = boardsOf(st).find((x) => x.id === owner)?.board;
  if (!b) return -1;
  const sum = (cards: Card[]) => cards.reduce((n, c) => n + c.value, 0);
  return sum(b.bank) + b.sets.reduce((n, s) => n + sum(s.cards) + (s.house?.value ?? 0) + (s.hotel?.value ?? 0), 0);
}

export function findSet(st: ClientGameState, owner: string | undefined, setId: string | undefined): PropertySet | undefined {
  if (!setId) return undefined;
  for (const b of boardsOf(st)) {
    if (owner && b.id !== owner) continue;
    const set = b.board.sets.find((s) => s.id === setId);
    if (set) return set;
  }
  return undefined;
}

export const buildingIds = (st: ClientGameState): Set<string> => {
  const ids = new Set<string>();
  for (const { board } of boardsOf(st)) for (const s of board.sets) for (const b of [s.house, s.hotel]) if (b) ids.add(b.id);
  return ids;
};

/** Every card of a set that changes tables with it, buildings included. */
export const withBuildings = (set: PropertySet): PropertySet => ({ ...set, cards: [...set.cards, ...(set.house ? [set.house] : []), ...(set.hotel ? [set.hotel] : [])] });
