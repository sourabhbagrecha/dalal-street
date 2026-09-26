import type {
  ActionType,
  Card,
  ClientGameState,
  ClientPendingInteraction,
  ContestedAction,
  PropertySet,
} from '@monopoly-deal/shared';
import { jsnFaceCard, jsnThreatLine, paymentReasonLabel } from '../../components/GamePrompts';
import { nameFor, setRent } from '../../derivations';
import { synthesizeFaceCard } from '../../moments/derive';
import { theme } from '../../theme';
import type { Prompt, TargetKind } from '../model';
import { ACTION_VALUE } from '../model';

/**
 * What the viewer owes the game right now, as the table's `Prompt` — the view-model twin of
 * `GamePrompts.pendingForLocal` + its payment-round handling. Only the TOP of the pending stack is ever
 * the viewer's to answer; anything a rival owes is `deriveWait`'s business (status.ts).
 */

/** Local, not-yet-sent choices the prompt shows back to the viewer. */
export interface PromptInput {
  /** forced_deal: the own property already picked to give. */
  give: string | null;
  /** payment: cards ticked so far. */
  paySel: string[];
  /** hand-limit discard: cards ticked so far. */
  discardSel: string[];
}

/** The store-API bits a prompt needs (rules stay behind the adapter). */
export interface PromptDeps {
  isCompleteSet(set: PropertySet): boolean;
  validatePayment(payerId: string, amountDue: number, cardIds: string[]): boolean;
}

type Top = ClientPendingInteraction;
type RoundTop = Extract<ClientPendingInteraction, { kind: 'payment_round' }>;

export const topPending = (state: ClientGameState): Top | undefined => state.pendingStack[state.pendingStack.length - 1];

/** The multicolour wildcard is worth nothing and the engine refuses it in a payment. */
export const isMulticolorWild = (c: Card): boolean => c.kind === 'property_wild' && c.colors.length === 0;

/**
 * Everything the viewer may hand over for a debt: bank, then each set's cards, house and hotel (the old PaymentPrompt's
 * list, minus the multicolour wildcard, which the engine never accepts as payment).
 */
export function payableAssets(state: ClientGameState): Card[] {
  const out: Card[] = [...state.you.board.bank];
  for (const set of state.you.board.sets) {
    out.push(...set.cards);
    if (set.house) out.push(set.house);
    if (set.hotel) out.push(set.hotel);
  }
  return out.filter((c) => !isMulticolorWild(c));
}

/** The viewer's complete sets that can still take this building — the old BuildingPrompt's filter, unchanged. */
export function buildingTargets(state: ClientGameState, building: 'house' | 'hotel', isCompleteSet: (s: PropertySet) => boolean): string[] {
  return state.you.board.sets
    .filter((set) => isCompleteSet(set) && (building === 'house' ? !set.house : !set.hotel))
    .map((set) => set.id);
}

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** A card on the viewer's own table (bank, set, house or hotel). */
function ownCard(state: ClientGameState, id: string | undefined): Card | null {
  if (!id) return null;
  const { board } = state.you;
  for (const c of board.bank) if (c.id === id) return c;
  for (const set of board.sets) {
    for (const c of set.cards) if (c.id === id) return c;
    if (set.house?.id === id) return set.house;
    if (set.hotel?.id === id) return set.hotel;
  }
  return null;
}

/** "Sly Deal", "Rent", "It's My Birthday" — the name of a contested action. */
export function contestedLabel(type: ContestedAction['type']): string {
  return type === 'rent' ? 'Rent' : (theme.actionNames[type] ?? type);
}

/** The card that started a choice: the viewer's own play when it is the top of the discard pile, else a synthesized face. */
function playedCard(state: ClientGameState, cardId: string | undefined, kind: TargetKind, building?: 'house' | 'hotel'): Card | null {
  if (cardId && state.discardTop?.id === cardId) return state.discardTop;
  switch (kind) {
    case 'sly_deal':
    case 'forced_deal':
    case 'deal_breaker':
    case 'debt_collector':
      return synthesizeFaceCard(kind);
    case 'rent':
    case 'rent_player':
      return synthesizeFaceCard('rent');
    case 'building': {
      if (!building) return null;
      const action: ActionType = building;
      return { id: `live-face-${building}`, kind: 'action', action, value: ACTION_VALUE[action] };
    }
  }
}

function payPrompt(state: ClientGameState, toId: string, amount: number, reason: string, input: PromptInput, deps: PromptDeps): Prompt {
  const assets = payableAssets(state);
  const ids = new Set(assets.map((c) => c.id));
  const sel = input.paySel.filter((id) => ids.has(id));
  return {
    kind: 'pay',
    toId,
    amount,
    reason: paymentReasonLabel(reason),
    sel,
    assets,
    valid: deps.validatePayment(state.viewerId, amount, sel),
  };
}

function jsnPrompt(state: ClientGameState, contested: ContestedAction, initiatorId: string, payerId?: string): Prompt {
  const label = contestedLabel(contested.type);
  const iAmActor = contested.actorId === state.viewerId;
  // The viewer's own action being answered with a Just Say No: the one to name is whoever just said it.
  const fromId = iAmActor ? initiatorId : contested.actorId;
  const targetsMe = !iAmActor && (contested.type === 'sly_deal' || contested.type === 'forced_deal');
  const prompt: Prompt = {
    kind: 'jsn',
    fromId,
    card: jsnFaceCard(contested.type) ?? synthesizeFaceCard('rent') ?? { id: 'live-face-rent', kind: 'rent', rentType: 'wild', colors: [], value: 3 },
    at: targetsMe ? ownCard(state, asString(contested.payload.targetCardId)) : null,
    label,
    threat: iAmActor
      ? `${nameFor(state, fromId)} said no to your ${label}`
      : jsnThreatLine(contested, state, (n) => theme.formatMoney(n)),
  };
  return payerId ? { ...prompt, payerId } : prompt;
}

/** The viewer's answer inside a multi-payer round: a Just Say No first (theirs or, as payee, a counter), then their own payment. */
function roundPrompt(state: ClientGameState, round: RoundTop, input: PromptInput, deps: PromptDeps): Prompt | null {
  const viewer = state.viewerId;
  for (const entry of round.entries) {
    if (entry.phase === 'jsn' && entry.jsn && entry.jsn.respondentId === viewer) {
      return jsnPrompt(state, entry.jsn.contestedAction, entry.jsn.initiatorId, entry.payerId);
    }
  }
  const mine = round.entries.find((e) => e.phase === 'payment' && e.payerId === viewer);
  return mine ? payPrompt(state, round.payeeId, mine.amountDue, round.reason, input, deps) : null;
}

export function derivePrompt(state: ClientGameState, input: PromptInput, deps: PromptDeps): Prompt | null {
  const top = topPending(state);
  if (!top) return null;
  const viewer = state.viewerId;

  switch (top.kind) {
    case 'payment_round':
      return roundPrompt(state, top, input, deps);
    case 'payment':
      return top.payerId === viewer ? payPrompt(state, top.payeeId, top.amountDue, top.reason, input, deps) : null;
    case 'just_say_no':
      return top.respondentId === viewer ? jsnPrompt(state, top.contestedAction, top.initiatorId) : null;
    case 'hand_limit_discard': {
      if (top.playerId !== viewer) return null;
      const held = new Set(state.you.hand.map((c) => c.id));
      return {
        kind: 'discard',
        excess: top.excess,
        sel: input.discardSel.filter((id) => held.has(id)).slice(0, top.excess),
        canResume: state.playsRemaining > 0,
      };
    }
    case 'sly_deal_target':
      return top.actorId === viewer ? { kind: 'target', action: 'sly_deal', card: playedCard(state, top.cardId, 'sly_deal') } : null;
    case 'deal_breaker_target':
      return top.actorId === viewer ? { kind: 'target', action: 'deal_breaker', card: playedCard(state, top.cardId, 'deal_breaker') } : null;
    case 'debt_collector_target':
      return top.actorId === viewer
        ? { kind: 'target', action: 'debt_collector', card: playedCard(state, top.cardId, 'debt_collector'), amount: 5 }
        : null;
    case 'forced_deal_target': {
      if (top.actorId !== viewer) return null;
      const give = input.give && ownCard(state, input.give) ? input.give : null;
      const card = playedCard(state, top.cardId, 'forced_deal');
      return give
        ? { kind: 'target', action: 'forced_deal', card, step: 'rival', give }
        : { kind: 'target', action: 'forced_deal', card, step: 'own' };
    }
    case 'rent_color_choice': {
      if (top.actorId !== viewer) return null;
      const colors = top.eligibleColors
        .map((color) => {
          const set = state.you.board.sets.find((s) => s.color === color);
          return { color, amount: set ? setRent(set) : 0 };
        })
        .sort((a, b) => b.amount - a.amount);
      return { kind: 'target', action: 'rent', card: playedCard(state, top.cardId, 'rent'), colors, doubles: top.doubleCount };
    }
    case 'rent_player_choice':
      return top.actorId === viewer
        ? {
            kind: 'target',
            action: 'rent_player',
            card: playedCard(state, top.cardId, 'rent_player'),
            amount: top.amount,
            colors: [{ color: top.color, amount: top.amount }],
            doubles: top.doubleCount,
          }
        : null;
    case 'house_hotel_target':
      return top.actorId === viewer
        ? {
            kind: 'target',
            action: 'building',
            card: playedCard(state, top.cardId, 'building', top.building),
            building: top.building,
            eligibleSets: buildingTargets(state, top.building, deps.isCompleteSet),
          }
        : null;
    case 'double_rent_pending':
      return null;
  }
}
