import type {
  ActionType,
  Card,
  ClientGameState,
  ClientPendingInteraction,
  ContestedAction,
  PlayerBoard,
} from '@monopoly-deal/shared';
import { selfOf } from '@monopoly-deal/shared';
import { completeSetsOnBoard, stealableFromBoard } from '@monopoly-deal/engine';
import { cardTitle, nameFor, setRent } from '../../derivations';
import { findCardOnTable, synthesizeFaceCard } from '../../moments/derive';
import { theme } from '../../theme';
import type { Prompt, TargetKind } from '../model';
import { ACTION_VALUE, buildTargets } from '../model';

/**
 * What the viewer owes the game right now, as the table's `Prompt` — the top of the pending stack plus its
 * payment-round handling. Only the TOP of the pending stack is ever the viewer's to answer; anything a rival owes
 * is `deriveWait`'s business (status.ts).
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
  const { board } = selfOf(state);
  const out: Card[] = [...board.bank];
  for (const set of board.sets) {
    out.push(...set.cards);
    if (set.house) out.push(set.house);
    if (set.hotel) out.push(set.hotel);
  }
  return out.filter((c) => !isMulticolorWild(c));
}

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const asNumber = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** reason slug -> friendly label. Payment reasons are engine-internal strings; never show one raw. */
const PAYMENT_REASON_LABELS: Record<string, string> = {
  rent: 'Rent',
  debt_collector: 'Debt Collector',
  birthday: "It's My Birthday",
};

function paymentReasonLabel(reason: string): string {
  return PAYMENT_REASON_LABELS[reason] ?? reason;
}

/** The synthesized face card for a Just Say No prompt's contested action. */
function jsnFaceCard(type: ContestedAction['type']): Card | null {
  switch (type) {
    case 'its_my_birthday':
      return synthesizeFaceCard('birthday');
    case 'double_the_rent':
      return synthesizeFaceCard('rent');
    case 'rent':
    case 'debt_collector':
    case 'sly_deal':
    case 'forced_deal':
    case 'deal_breaker':
      return synthesizeFaceCard(type);
  }
}

/** "wants to take your Agra" — what's actually at stake (the actor is named beside it), so the JSN decision is informed. */
function jsnThreatPredicate(
  contested: ContestedAction,
  clientState: ClientGameState,
  formatMoney: (n: number) => string,
): string {
  const payload = contested.payload;
  switch (contested.type) {
    case 'sly_deal': {
      const card = findCardOnTable(clientState, asString(payload.targetCardId));
      return `wants to take your ${card ? cardTitle(card) : 'property'}`;
    }
    case 'forced_deal': {
      const theirs = findCardOnTable(clientState, asString(payload.ownCardId));
      const yours = findCardOnTable(clientState, asString(payload.targetCardId));
      return `wants to swap ${theirs ? cardTitle(theirs) : 'their property'} for your ${yours ? cardTitle(yours) : 'property'}`;
    }
    case 'deal_breaker': {
      const setId = asString(payload.targetSetId);
      const set = selfOf(clientState).board.sets.find((s) => s.id === setId);
      const colorName = set ? theme.propertyNames[set.color] ?? set.color : 'property';
      return `wants your whole ${colorName} set`;
    }
    case 'debt_collector':
      return `demands ${formatMoney(5)}`;
    case 'its_my_birthday':
      return `wants ${formatMoney(2)} for their birthday`;
    case 'rent': {
      const amount = asNumber(payload.amount) ?? 0;
      return `charges you ${formatMoney(amount)} rent`;
    }
    case 'double_the_rent':
      return `is doubling the rent against you`;
    default:
      return `played an action against you`;
  }
}

/** Whether any rival's board passes `test`. */
function rivalHas(state: ClientGameState, test: (board: PlayerBoard) => boolean): boolean {
  return state.players.some((pl) => pl.id !== state.viewerId && test(pl.board));
}

/** A card on the viewer's own table (bank, set, house or hotel). */
function ownCard(state: ClientGameState, id: string | undefined): Card | null {
  if (!id) return null;
  const { board } = selfOf(state);
  for (const c of board.bank) if (c.id === id) return c;
  for (const set of board.sets) {
    for (const c of set.cards) if (c.id === id) return c;
    if (set.house?.id === id) return set.house;
    if (set.hotel?.id === id) return set.hotel;
  }
  return null;
}

/** "Sly Deal", "Rent", "It's My Birthday" — the name of a contested action. */
function contestedLabel(type: ContestedAction['type']): string {
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

function payPrompt(state: ClientGameState, toId: string, amount: number, reason: string, input: PromptInput, deps: PromptDeps, jsn?: true): Prompt {
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
    ...(jsn && { jsn }),
  };
}

function jsnPrompt(state: ClientGameState, contested: ContestedAction, initiatorId: string, payerId?: string): Prompt {
  const label = contestedLabel(contested.type);
  const iAmActor = contested.actorId === state.viewerId;
  // The viewer's own action being answered with a Just Say No: the one to name is whoever just said it.
  const fromId = iAmActor ? initiatorId : contested.actorId;
  const what = iAmActor ? `said no to your ${label}` : jsnThreatPredicate(contested, state, (n) => theme.formatMoney(n));
  const targetsMe = !iAmActor && (contested.type === 'sly_deal' || contested.type === 'forced_deal');
  const prompt: Prompt = {
    kind: 'jsn',
    fromId,
    card: jsnFaceCard(contested.type) ?? synthesizeFaceCard('rent') ?? { id: 'live-face-rent', kind: 'rent', rentType: 'wild', colors: [], value: 3 },
    at: targetsMe ? ownCard(state, asString(contested.payload.targetCardId)) : null,
    label,
    who: nameFor(state, fromId),
    what,
  };
  return payerId ? { ...prompt, payerId } : prompt;
}

const DEBT_COLLECTOR_AMOUNT = 5;

/** A Debt Collector aimed at the viewer, waiting on their answer, with something on their table to pay it with. */
function isDebtOnViewer(state: ClientGameState, top: Extract<Top, { kind: 'just_say_no' }>): boolean {
  return (
    top.contestedAction.type === 'debt_collector' &&
    top.contestedAction.targetPlayerId === top.respondentId &&
    payableAssets(state).length > 0
  );
}

/**
 * The viewer's answer inside a multi-payer round: a payer's own Just Say No window is the payment itself (paying lets
 * the demand stand), a counter as payee is a Just Say No prompt, and then their own payment.
 */
function roundPrompt(state: ClientGameState, round: RoundTop, input: PromptInput, deps: PromptDeps): Prompt | null {
  const viewer = state.viewerId;
  for (const entry of round.entries) {
    if (entry.phase === 'jsn' && entry.jsn && entry.jsn.respondentId === viewer) {
      return entry.payerId === viewer
        ? payPrompt(state, round.payeeId, entry.amountDue, round.reason, input, deps, true)
        : jsnPrompt(state, entry.jsn.contestedAction, entry.jsn.initiatorId, entry.payerId);
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
      if (top.respondentId !== viewer) return null;
      // A Debt Collector on you: its Just Say No window is the payment itself, so holding one or not looks the same.
      return isDebtOnViewer(state, top)
        ? payPrompt(state, top.contestedAction.actorId, DEBT_COLLECTOR_AMOUNT, 'debt_collector', input, deps, true)
        : jsnPrompt(state, top.contestedAction, top.initiatorId);
    case 'hand_limit_discard': {
      if (top.playerId !== viewer) return null;
      const held = new Set(state.hand.map((c) => c.id));
      return {
        kind: 'discard',
        excess: top.excess,
        sel: input.discardSel.filter((id) => held.has(id)).slice(0, top.excess),
        canResume: state.playsRemaining > 0,
      };
    }
    case 'sly_deal_target': {
      if (top.actorId !== viewer) return null;
      const empty = !rivalHas(state, (b) => stealableFromBoard(b).length > 0);
      return { kind: 'target', action: 'sly_deal', card: playedCard(state, top.cardId, 'sly_deal'), ...(empty && { empty }) };
    }
    case 'deal_breaker_target': {
      if (top.actorId !== viewer) return null;
      const empty = !rivalHas(state, (b) => completeSetsOnBoard(b).length > 0);
      return { kind: 'target', action: 'deal_breaker', card: playedCard(state, top.cardId, 'deal_breaker'), ...(empty && { empty }) };
    }
    case 'debt_collector_target':
      return top.actorId === viewer
        ? { kind: 'target', action: 'debt_collector', card: playedCard(state, top.cardId, 'debt_collector'), amount: 5 }
        : null;
    case 'forced_deal_target': {
      if (top.actorId !== viewer) return null;
      const give = input.give && ownCard(state, input.give) ? input.give : null;
      const card = playedCard(state, top.cardId, 'forced_deal');
      if (stealableFromBoard(selfOf(state).board).length === 0 || !rivalHas(state, (b) => stealableFromBoard(b).length > 0)) {
        return { kind: 'target', action: 'forced_deal', card, step: 'own', empty: true };
      }
      return give
        ? { kind: 'target', action: 'forced_deal', card, step: 'rival', give }
        : { kind: 'target', action: 'forced_deal', card, step: 'own' };
    }
    case 'rent_color_choice': {
      if (top.actorId !== viewer) return null;
      const colors = top.eligibleColors
        .map((color) => {
          const set = selfOf(state).board.sets.find((s) => s.color === color);
          // Each Double the Rent stacked on the card doubles what the set charges, so the pick shows what will be owed.
          return { color, amount: set ? setRent(set) * 2 ** top.doubleCount : 0 };
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
            eligibleSets: buildTargets(selfOf(state).board.sets, top.building).map((set) => set.id),
          }
        : null;
    case 'double_rent_pending':
      return null;
  }
}
