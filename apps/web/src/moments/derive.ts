/**
 * Turns fresh log entries into `Moment`s (see `moments/types.ts`).
 *
 * Every field is read from the event's `data` first (the engine's contract —
 * see the brief's "Engine event data contract" table). Because the engine
 * agent is landing those `data` fields separately, every reader here is
 * defensive: when `data` is missing a field, we fall back to parsing the
 * event's `message` (whose wording is stable — see `packages/engine/src/
 * dispatch.ts`) or, for `just_say_no`, to the still-pending `contestedAction`
 * visible on `state.pendingStack` (public table info, redacted the same way
 * for every viewer). If a moment's essential ids still can't be resolved, we
 * drop it rather than emit something wrong.
 */
import type { Card, ClientGameState, ContestedAction, PropertyColor } from '@monopoly-deal/shared';
import type { DeriveMoments, Moment, MomentKind } from './types';

type RawEntry = {
  id: number;
  type: string;
  playerId?: string;
  data?: Record<string, unknown>;
  /**
   * Not part of `DeriveMoments`' declared entry shape (the contract only
   * promises `id`/`type`/`playerId`/`data`), but every real `LogEntry` is a
   * `GameEvent` and always carries one — used only as a fallback source.
   */
  message?: string;
};

const KIND_BY_EVENT: Partial<Record<string, MomentKind>> = {
  sly_deal: 'sly_deal',
  forced_deal: 'forced_deal',
  deal_breaker: 'deal_breaker',
  debt_collector: 'debt_collector',
  birthday: 'birthday',
  rent_charged: 'rent',
  payment_made: 'payment',
  just_say_no: 'just_say_no',
  action_cancelled: 'action_cancelled',
  set_broken: 'set_broken',
};

/** Kind for a raw log entry's event type — exposed so callers can classify a
 * freshly-resolved event without re-deriving the whole Moment. */
export function momentKindForEventType(type: string): MomentKind | undefined {
  return KIND_BY_EVENT[type];
}

/** A contested action's `type` maps 1:1 onto a `MomentKind`, except
 * `its_my_birthday` (engine name) vs `birthday` (moment name). */
const CONTESTED_KIND_BY_TYPE: Partial<Record<ContestedAction['type'], MomentKind>> = {
  sly_deal: 'sly_deal',
  forced_deal: 'forced_deal',
  deal_breaker: 'deal_breaker',
  debt_collector: 'debt_collector',
  its_my_birthday: 'birthday',
  rent: 'rent',
};

/** The three attacks that steal a property and so get a card-flight animation. */
export const STEAL_KINDS = new Set<MomentKind>(['sly_deal', 'forced_deal', 'deal_breaker']);

function hashKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return h;
}

/** Stable identity for one contested action, independent of its eventual log id. */
export function threatKey(kind: MomentKind, actorId: string, targetPlayerId: string): string {
  return `${kind}:${actorId}:${targetPlayerId}`;
}

export function threatKeyForMoment(moment: Moment): string {
  return threatKey(moment.kind, moment.actorId, moment.targetIds[0] ?? '');
}

export function threatKeyForContested(contested: ContestedAction): string | undefined {
  const kind = CONTESTED_KIND_BY_TYPE[contested.type];
  return kind && contested.targetPlayerId ? threatKey(kind, contested.actorId, contested.targetPlayerId) : undefined;
}

/** Same identity, read off the eventual resolved log entry instead of the pending action. */
export function resolvedThreatKeyFor(entry: {
  type: string;
  playerId?: string;
  data?: Record<string, unknown>;
}): string | undefined {
  if (entry.type === 'action_cancelled') {
    const contested = entry.data?.contested as ContestedAction | undefined;
    return contested ? threatKeyForContested(contested) : undefined;
  }
  const kind = KIND_BY_EVENT[entry.type];
  if (!kind) return undefined;
  const isSteal = STEAL_KINDS.has(kind);
  if (!isSteal && kind !== 'debt_collector' && kind !== 'birthday' && kind !== 'rent') return undefined;
  const actorId = entry.playerId;
  if (!actorId) return undefined;
  const targetPlayerId = isSteal ? asString(entry.data?.targetPlayerId) : asString(entry.data?.payerId);
  if (!targetPlayerId) return undefined;
  return threatKey(kind, actorId, targetPlayerId);
}

export interface PendingContestedEntry {
  contestedAction: ContestedAction;
  respondentId: string;
}

/** Every contested action currently awaiting a Just Say No response, public info already
 * on `state.pendingStack` for every viewer. */
export function collectPendingContested(state: ClientGameState): PendingContestedEntry[] {
  const out: PendingContestedEntry[] = [];
  for (const pending of state.pendingStack) {
    if (pending.kind === 'just_say_no') {
      out.push({ contestedAction: pending.contestedAction, respondentId: pending.respondentId });
    } else if (pending.kind === 'payment_round') {
      for (const entry of pending.entries) {
        if (entry.jsn) out.push({ contestedAction: entry.jsn.contestedAction, respondentId: entry.jsn.respondentId });
      }
    }
  }
  return out;
}

const PROPERTY_COLORS = new Set<string>([
  'brown',
  'light_blue',
  'pink',
  'orange',
  'red',
  'yellow',
  'green',
  'dark_blue',
  'railroad',
  'utility',
]);

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : undefined;
}

function asColor(v: unknown): PropertyColor | undefined {
  return typeof v === 'string' && PROPERTY_COLORS.has(v) ? (v as PropertyColor) : undefined;
}

function messageOf(entry: { id: number; type: string; playerId?: string; data?: Record<string, unknown> }): string {
  return (entry as RawEntry).message ?? '';
}

function knownPlayerIds(state: ClientGameState): Set<string> {
  return new Set([state.you.id, ...state.players.map((p) => p.id)]);
}

/** Searches every public board (never a hand) for a card by id. */
export function findCardOnTable(state: ClientGameState, cardId: string | undefined): Card | undefined {
  if (!cardId) return undefined;
  const boards = [state.you.board, ...state.players.map((p) => p.board)];
  for (const board of boards) {
    for (const set of board.sets) {
      for (const c of set.cards) {
        if (c.id === cardId) return c;
      }
      if (set.house?.id === cardId) return set.house;
      if (set.hotel?.id === cardId) return set.hotel;
    }
    for (const c of board.bank) {
      if (c.id === cardId) return c;
    }
  }
  return undefined;
}

function colorOfCard(card: Card | undefined): PropertyColor | undefined {
  if (!card) return undefined;
  if (card.kind === 'property') return card.color;
  if (card.kind === 'property_wild') return card.assignedColor ?? card.colors[0];
  return undefined;
}

// ---- message-format fallbacks (mirrors dispatch.ts's literal message text) ----

function matchSlyDeal(message: string): { cardId: string; targetPlayerId: string } | undefined {
  const m = /^(\S+) sly-dealt (\S+) from (\S+)$/.exec(message);
  return m ? { cardId: m[2]!, targetPlayerId: m[3]! } : undefined;
}

function matchForcedDeal(message: string): { targetPlayerId: string } | undefined {
  const m = /^(\S+) forced deal with (\S+)$/.exec(message);
  return m ? { targetPlayerId: m[2]! } : undefined;
}

function matchDealBreaker(message: string): { color: string; targetPlayerId: string } | undefined {
  const m = /^(\S+) deal-broke a (\S+) set from (\S+)$/.exec(message);
  return m ? { color: m[2]!, targetPlayerId: m[3]! } : undefined;
}

function matchDebtCollector(message: string): { amount: number; targetPlayerId: string } | undefined {
  const m = /^(\S+) demands ₹(\d+)Cr from (\S+)$/.exec(message);
  return m ? { amount: Number(m[2]), targetPlayerId: m[3]! } : undefined;
}

function matchBirthday(message: string): { amount: number; targetPlayerId: string } | undefined {
  const m = /^(\S+) owes ₹(\d+)Cr birthday money to (\S+)$/.exec(message);
  return m ? { targetPlayerId: m[1]!, amount: Number(m[2]) } : undefined;
}

function matchRent(message: string): { amount: number; targetPlayerId: string } | undefined {
  const m = /^(\S+) charges (\S+) ₹(\d+)Cr rent$/.exec(message);
  return m ? { targetPlayerId: m[2]!, amount: Number(m[3]) } : undefined;
}

function matchPayment(message: string): { total: number; payeeId: string } | undefined {
  const m = /^(\S+) paid ₹(\d+)Cr to (\S+) \(owed ₹\d+Cr\)$/.exec(message);
  return m ? { total: Number(m[2]), payeeId: m[3]! } : undefined;
}

function matchSetBroken(message: string): { color?: PropertyColor; reason: string } {
  const payment = /^\S+'s (\S+) set broke due to payment$/.exec(message);
  if (payment) return { color: asColor(payment[1]), reason: 'payment' };
  if (message === 'Set broken by rearrange') return { reason: 'rearrange' };
  return { reason: 'steal' };
}

/** Public `just_say_no` pending context for a player who just played one. */
function pendingJsnContextFor(
  state: ClientGameState,
  playerId: string,
): { contestedType: string; contestedActorId: string; contestedTargetId?: string; chain: number } | undefined {
  const fromContested = (
    contested: ContestedAction,
    chain: number,
  ): { contestedType: string; contestedActorId: string; contestedTargetId?: string; chain: number } => ({
    contestedType: contested.type,
    contestedActorId: contested.actorId,
    contestedTargetId: contested.targetPlayerId,
    chain,
  });

  for (const pending of state.pendingStack) {
    if (pending.kind === 'just_say_no' && pending.initiatorId === playerId) {
      return fromContested(pending.contestedAction, pending.jsnCount);
    }
    if (pending.kind === 'payment_round') {
      for (const entry of pending.entries) {
        if (entry.jsn && entry.jsn.initiatorId === playerId) {
          return fromContested(entry.jsn.contestedAction, entry.jsn.jsnCount);
        }
      }
    }
  }
  return undefined;
}

interface Resolved {
  actorId: string;
  targetIds: string[];
  cards: Card[];
  givenCard?: Card;
  color?: PropertyColor;
  setId?: string;
  amount?: number;
  chain?: number;
  contestedType?: string;
  reason?: string;
}

function resolveSlyDeal(entry: RawEntry, state: ClientGameState): Resolved | undefined {
  const actorId = entry.playerId;
  if (!actorId) return undefined;
  const fromMessage = matchSlyDeal(messageOf(entry));
  const cardId = asString(entry.data?.cardId) ?? fromMessage?.cardId;
  const targetPlayerId = asString(entry.data?.targetPlayerId) ?? fromMessage?.targetPlayerId;
  if (!targetPlayerId) return undefined;
  const card = findCardOnTable(state, cardId);
  return {
    actorId,
    targetIds: [targetPlayerId],
    cards: card ? [card] : [],
    color: asColor(entry.data?.color) ?? colorOfCard(card),
  };
}

function resolveForcedDeal(entry: RawEntry, state: ClientGameState): Resolved | undefined {
  const actorId = entry.playerId;
  if (!actorId) return undefined;
  const fromMessage = matchForcedDeal(messageOf(entry));
  const targetPlayerId = asString(entry.data?.targetPlayerId) ?? fromMessage?.targetPlayerId;
  if (!targetPlayerId) return undefined;
  const targetCardId = asString(entry.data?.targetCardId);
  const ownCardId = asString(entry.data?.ownCardId);
  const taken = findCardOnTable(state, targetCardId);
  const given = findCardOnTable(state, ownCardId);
  return {
    actorId,
    targetIds: [targetPlayerId],
    cards: taken ? [taken] : [],
    givenCard: given,
    color: colorOfCard(taken),
  };
}

function resolveDealBreaker(entry: RawEntry, state: ClientGameState): Resolved | undefined {
  const actorId = entry.playerId;
  if (!actorId) return undefined;
  const fromMessage = matchDealBreaker(messageOf(entry));
  const targetPlayerId = asString(entry.data?.targetPlayerId) ?? fromMessage?.targetPlayerId;
  if (!targetPlayerId) return undefined;
  const color = asColor(entry.data?.color) ?? asColor(fromMessage?.color);
  const setId = asString(entry.data?.setId);
  const dataCardIds = asStringArray(entry.data?.cardIds);

  let cards: Card[] = [];
  if (dataCardIds) {
    cards = dataCardIds.map((id) => findCardOnTable(state, id)).filter((c): c is Card => Boolean(c));
  } else {
    // Fallback: the set now lives on the actor's board (transferSet gives it a
    // fresh id), so find it by setId first, then by matching color.
    const actor = state.players.find((p) => p.id === actorId) ?? (state.you.id === actorId ? state.you : undefined);
    const set =
      (setId && actor?.board.sets.find((s) => s.id === setId)) ||
      (color && actor?.board.sets.find((s) => s.color === color));
    if (set) {
      cards = [...set.cards];
      if (set.house) cards.push(set.house);
      if (set.hotel) cards.push(set.hotel);
    }
  }

  return {
    actorId,
    targetIds: [targetPlayerId],
    cards,
    color,
    setId,
  };
}

function resolveDebtCollector(entry: RawEntry): Resolved | undefined {
  const actorId = entry.playerId;
  if (!actorId) return undefined;
  const fromMessage = matchDebtCollector(messageOf(entry));
  const payerId = asString(entry.data?.payerId) ?? fromMessage?.targetPlayerId;
  if (!payerId) return undefined;
  const amount = asNumber(entry.data?.amount) ?? fromMessage?.amount ?? 5;
  return { actorId, targetIds: [payerId], cards: [], amount };
}

function resolveBirthday(entry: RawEntry): Resolved | undefined {
  const actorId = entry.playerId;
  if (!actorId) return undefined;
  const fromMessage = matchBirthday(messageOf(entry));
  const payerId = asString(entry.data?.payerId) ?? fromMessage?.targetPlayerId;
  if (!payerId) return undefined;
  const amount = asNumber(entry.data?.amount) ?? fromMessage?.amount ?? 2;
  return { actorId, targetIds: [payerId], cards: [], amount };
}

function resolveRent(entry: RawEntry): Resolved | undefined {
  const actorId = entry.playerId;
  if (!actorId) return undefined;
  const fromMessage = matchRent(messageOf(entry));
  const payerId = asString(entry.data?.payerId) ?? fromMessage?.targetPlayerId;
  if (!payerId) return undefined;
  const amount = asNumber(entry.data?.amount) ?? fromMessage?.amount;
  const color = asColor(entry.data?.color);
  return { actorId, targetIds: [payerId], cards: [], amount, color };
}

function resolvePayment(entry: RawEntry, state: ClientGameState): Resolved | undefined {
  const actorId = entry.playerId;
  if (!actorId) return undefined;
  const fromMessage = matchPayment(messageOf(entry));
  const payeeId = asString(entry.data?.payeeId) ?? fromMessage?.payeeId;
  if (!payeeId) return undefined;
  const amount = asNumber(entry.data?.total) ?? fromMessage?.total;
  const cardIds = asStringArray(entry.data?.cardIds) ?? [];
  const cards = cardIds.map((id) => findCardOnTable(state, id)).filter((c): c is Card => Boolean(c));
  return { actorId, targetIds: [payeeId], cards, amount };
}

function resolveJustSayNo(entry: RawEntry, state: ClientGameState): Resolved | undefined {
  const actorId = entry.playerId;
  if (!actorId) return undefined;
  const contestedType = asString(entry.data?.contestedType);
  const contestedActorId = asString(entry.data?.contestedActorId);
  const contestedTargetId = asString(entry.data?.contestedTargetId);
  const chain = asNumber(entry.data?.chain);

  let resolvedType = contestedType;
  let resolvedActor = contestedActorId;
  let resolvedTarget = contestedTargetId;
  let resolvedChain = chain;

  if (!resolvedActor) {
    const ctx = pendingJsnContextFor(state, actorId);
    if (ctx) {
      resolvedType = resolvedType ?? ctx.contestedType;
      resolvedActor = ctx.contestedActorId;
      resolvedTarget = resolvedTarget ?? ctx.contestedTargetId;
      resolvedChain = resolvedChain ?? ctx.chain;
    }
  }
  if (!resolvedActor) return undefined;

  const isCounter = actorId === resolvedActor;
  const targetId = isCounter ? resolvedTarget : resolvedActor;
  if (!targetId) return undefined;

  return {
    actorId,
    targetIds: [targetId],
    cards: [],
    chain: resolvedChain,
    contestedType: resolvedType,
  };
}

function resolveActionCancelled(entry: RawEntry, allEntries: readonly RawEntry[]): Resolved | undefined {
  if (entry.data?.forced === true) return undefined;
  const contested = entry.data?.contested as ContestedAction | undefined;
  if (!contested || typeof contested.actorId !== 'string') return undefined;

  const by =
    asString(entry.data?.by) ??
    (() => {
      const idx = allEntries.findIndex((e) => e.id === entry.id);
      for (let i = idx - 1; i >= 0; i--) {
        const e = allEntries[i]!;
        if (e.type === 'just_say_no' && e.playerId) return e.playerId;
      }
      return undefined;
    })();
  if (!by) return undefined;

  return {
    actorId: by,
    targetIds: [contested.actorId],
    cards: [],
    contestedType: contested.type,
  };
}

function resolveSetBroken(entry: RawEntry): Resolved | undefined {
  const ownerId = entry.playerId;
  if (!ownerId) return undefined;
  const parsed = matchSetBroken(messageOf(entry));
  const color = asColor(entry.data?.color) ?? parsed.color;
  const reason = asString(entry.data?.reason) ?? parsed.reason;
  return { actorId: ownerId, targetIds: [ownerId], cards: [], color, reason };
}

export function synthesizeFaceCard(kind: MomentKind): Card | null {
  switch (kind) {
    case 'sly_deal':
      return { id: 'moment-face-sly_deal', kind: 'action', action: 'sly_deal', value: 3 };
    case 'forced_deal':
      return { id: 'moment-face-forced_deal', kind: 'action', action: 'forced_deal', value: 3 };
    case 'deal_breaker':
      return { id: 'moment-face-deal_breaker', kind: 'action', action: 'deal_breaker', value: 5 };
    case 'debt_collector':
      return { id: 'moment-face-debt_collector', kind: 'action', action: 'debt_collector', value: 3 };
    case 'birthday':
      return { id: 'moment-face-birthday', kind: 'action', action: 'its_my_birthday', value: 2 };
    case 'just_say_no':
      return { id: 'moment-face-just_say_no', kind: 'action', action: 'just_say_no', value: 4 };
    case 'rent':
      return { id: 'moment-face-rent', kind: 'rent', rentType: 'wild', colors: [], value: 3 };
    default:
      return null;
  }
}

function playerBoardOf(state: ClientGameState, playerId: string) {
  return state.players.find((p) => p.id === playerId) ?? (state.you.id === playerId ? state.you : undefined);
}

function resolvePendingSlyDeal(contested: ContestedAction, state: ClientGameState): Resolved | undefined {
  const targetPlayerId = contested.targetPlayerId;
  if (!targetPlayerId) return undefined;
  const card = findCardOnTable(state, asString(contested.payload.targetCardId));
  return { actorId: contested.actorId, targetIds: [targetPlayerId], cards: card ? [card] : [], color: colorOfCard(card) };
}

function resolvePendingForcedDeal(contested: ContestedAction, state: ClientGameState): Resolved | undefined {
  const targetPlayerId = contested.targetPlayerId;
  if (!targetPlayerId) return undefined;
  const taken = findCardOnTable(state, asString(contested.payload.targetCardId));
  const given = findCardOnTable(state, asString(contested.payload.ownCardId));
  return {
    actorId: contested.actorId,
    targetIds: [targetPlayerId],
    cards: taken ? [taken] : [],
    givenCard: given,
    color: colorOfCard(taken),
  };
}

function resolvePendingDealBreaker(contested: ContestedAction, state: ClientGameState): Resolved | undefined {
  const targetPlayerId = contested.targetPlayerId;
  if (!targetPlayerId) return undefined;
  const setId = asString(contested.payload.targetSetId);
  const victim = playerBoardOf(state, targetPlayerId);
  const set = setId ? victim?.board.sets.find((s) => s.id === setId) : undefined;
  const cards = set ? [...set.cards, ...(set.house ? [set.house] : []), ...(set.hotel ? [set.hotel] : [])] : [];
  return { actorId: contested.actorId, targetIds: [targetPlayerId], cards, color: set?.color, setId };
}

function resolvePendingDebtCollector(contested: ContestedAction): Resolved | undefined {
  const targetPlayerId = contested.targetPlayerId;
  if (!targetPlayerId) return undefined;
  return { actorId: contested.actorId, targetIds: [targetPlayerId], cards: [], amount: 5 };
}

function resolvePendingBirthday(contested: ContestedAction): Resolved | undefined {
  const targetPlayerId = contested.targetPlayerId;
  if (!targetPlayerId) return undefined;
  return { actorId: contested.actorId, targetIds: [targetPlayerId], cards: [], amount: 2 };
}

function resolvePendingRent(contested: ContestedAction): Resolved | undefined {
  const targetPlayerId = contested.targetPlayerId;
  if (!targetPlayerId) return undefined;
  return {
    actorId: contested.actorId,
    targetIds: [targetPlayerId],
    cards: [],
    amount: asNumber(contested.payload.amount),
    color: asColor(contested.payload.color),
  };
}

/**
 * Builds the same shape of Moment a resolved log entry would produce, straight off a
 * still-pending `ContestedAction` — lets the client announce an attack the instant the
 * target is locked in, instead of waiting out the Just Say No window.
 * `swap` reverses actor/target, used to fly a steal's card back on a JSN cancellation.
 */
export function deriveMomentForContested(
  contested: ContestedAction,
  state: ClientGameState,
  opts: { now: number },
  swap = false,
): Moment | undefined {
  const kind = CONTESTED_KIND_BY_TYPE[contested.type];
  if (!kind) return undefined;
  let resolved: Resolved | undefined;
  switch (kind) {
    case 'sly_deal':
      resolved = resolvePendingSlyDeal(contested, state);
      break;
    case 'forced_deal':
      resolved = resolvePendingForcedDeal(contested, state);
      break;
    case 'deal_breaker':
      resolved = resolvePendingDealBreaker(contested, state);
      break;
    case 'debt_collector':
      resolved = resolvePendingDebtCollector(contested);
      break;
    case 'birthday':
      resolved = resolvePendingBirthday(contested);
      break;
    case 'rent':
      resolved = resolvePendingRent(contested);
      break;
    default:
      return undefined;
  }
  if (!resolved) return undefined;
  const known = knownPlayerIds(state);
  if (!known.has(resolved.actorId) || resolved.targetIds.some((id) => !known.has(id))) return undefined;

  const key = threatKey(kind, resolved.actorId, resolved.targetIds[0] ?? '');
  return {
    id: -Math.abs(hashKey(swap ? `${key}:reverse` : key)) - 1,
    kind,
    actorId: swap ? (resolved.targetIds[0] ?? resolved.actorId) : resolved.actorId,
    targetIds: swap ? [resolved.actorId] : resolved.targetIds,
    cards: resolved.cards,
    givenCard: resolved.givenCard,
    faceCard: synthesizeFaceCard(kind),
    color: resolved.color,
    setId: resolved.setId,
    amount: resolved.amount,
    witnessedBy: [],
    at: opts.now,
  };
}

export function deriveThreatMoments(
  entries: readonly PendingContestedEntry[],
  state: ClientGameState,
  opts: { now: number },
): Moment[] {
  const out: Moment[] = [];
  for (const { contestedAction } of entries) {
    const moment = deriveMomentForContested(contestedAction, state, opts);
    if (moment) out.push(moment);
  }
  return out;
}

function resolveSelfInitiated(
  kind: MomentKind,
  actorId: string,
  opts: { viewerId: string; mode: 'local' | 'network'; now: number; selfPaymentAt?: number },
): boolean | undefined {
  if (kind !== 'payment') return undefined;
  if (opts.mode === 'local') return actorId === opts.viewerId;
  return opts.selfPaymentAt !== undefined && opts.now - opts.selfPaymentAt < 2500;
}

export const deriveMoments: DeriveMoments = (entries, state, opts) => {
  const raw = entries as ReadonlyArray<RawEntry>;
  const players = knownPlayerIds(state);
  const moments: Moment[] = [];

  for (const entry of raw) {
    const kind = KIND_BY_EVENT[entry.type];
    if (!kind) continue;

    let resolved: Resolved | undefined;
    switch (kind) {
      case 'sly_deal':
        resolved = resolveSlyDeal(entry, state);
        break;
      case 'forced_deal':
        resolved = resolveForcedDeal(entry, state);
        break;
      case 'deal_breaker':
        resolved = resolveDealBreaker(entry, state);
        break;
      case 'debt_collector':
        resolved = resolveDebtCollector(entry);
        break;
      case 'birthday':
        resolved = resolveBirthday(entry);
        break;
      case 'rent':
        resolved = resolveRent(entry);
        break;
      case 'payment':
        resolved = resolvePayment(entry, state);
        break;
      case 'just_say_no':
        resolved = resolveJustSayNo(entry, state);
        break;
      case 'action_cancelled':
        resolved = resolveActionCancelled(entry, raw);
        break;
      case 'set_broken':
        resolved = resolveSetBroken(entry);
        break;
      default:
        resolved = undefined;
    }
    if (!resolved) continue;
    // Defensive: only trust ids that are actually seats at this table.
    if (!players.has(resolved.actorId) || resolved.targetIds.some((id) => !players.has(id))) continue;

    moments.push({
      id: entry.id,
      kind,
      actorId: resolved.actorId,
      targetIds: resolved.targetIds,
      cards: resolved.cards,
      givenCard: resolved.givenCard,
      faceCard: synthesizeFaceCard(kind),
      amount: resolved.amount,
      color: resolved.color,
      setId: resolved.setId,
      chain: resolved.chain,
      contestedType: resolved.contestedType,
      reason: resolved.reason,
      selfInitiated: resolveSelfInitiated(kind, resolved.actorId, opts),
      witnessedBy: [],
      at: opts.now,
    });
  }

  return moments;
};
