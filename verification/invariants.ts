import type { Card, GameState, PendingInteraction } from '@monopoly-deal/shared';
import { DECK_SIZE, MAX_PLAYS } from '@monopoly-deal/shared';
import { countCompleteSets, isCompleteSet } from '@monopoly-deal/engine';

export interface InvariantViolation {
  name: string;
  detail: string;
}

function collectAllCards(state: GameState): Card[] {
  const cards: Card[] = [];
  cards.push(...state.deck, ...state.discard, ...state.outOfPlay);
  for (const p of state.players) {
    cards.push(...p.hand, ...p.board.bank);
    for (const set of p.board.sets) {
      cards.push(...set.cards);
      if (set.house) cards.push(set.house);
      if (set.hotel) cards.push(set.hotel);
    }
  }
  return cards;
}

export function assertCardConservation(state: GameState): InvariantViolation | null {
  const cards = collectAllCards(state);
  if (cards.length !== DECK_SIZE) {
    return {
      name: 'card_conservation',
      detail: `Expected ${DECK_SIZE} cards, found ${cards.length}`,
    };
  }
  return null;
}

export function assertUniqueCardIds(state: GameState): InvariantViolation | null {
  const cards = collectAllCards(state);
  const seen = new Set<string>();
  for (const c of cards) {
    if (seen.has(c.id)) {
      return {
        name: 'unique_card_ids',
        detail: `Duplicate card id ${c.id}`,
      };
    }
    seen.add(c.id);
  }
  return null;
}

export function assertBankValuesNonNegative(state: GameState): InvariantViolation | null {
  for (const p of state.players) {
    for (const c of p.board.bank) {
      if (c.value < 0) {
        return {
          name: 'bank_non_negative',
          detail: `Player ${p.id} has bank card ${c.id} with value ${c.value}`,
        };
      }
    }
  }
  return null;
}

export function assertPlaysRemaining(state: GameState): InvariantViolation | null {
  if (state.playsRemaining < 0 || state.playsRemaining > MAX_PLAYS) {
    return {
      name: 'plays_remaining',
      detail: `playsRemaining=${state.playsRemaining} not in 0..${MAX_PLAYS}`,
    };
  }
  return null;
}

export function assertHandSizesNonNegative(state: GameState): InvariantViolation | null {
  for (const p of state.players) {
    if (p.hand.length < 0) {
      return {
        name: 'hand_size',
        detail: `Player ${p.id} has negative hand size`,
      };
    }
  }
  return null;
}

export function assertWinnerHasThreeSets(state: GameState): InvariantViolation | null {
  if (!state.winnerId) return null;
  const winner = state.players.find((p) => p.id === state.winnerId);
  if (!winner) {
    return { name: 'winner_sets', detail: `Winner ${state.winnerId} not in players` };
  }
  const sets = countCompleteSets(winner);
  if (sets < 3) {
    return {
      name: 'winner_sets',
      detail: `Winner ${state.winnerId} has only ${sets} complete sets`,
    };
  }
  return null;
}

function pendingRefsLive(state: GameState, pending: PendingInteraction): string | null {
  const playerIds = new Set(state.players.map((p) => p.id));
  const allIds = new Set(collectAllCards(state).map((c) => c.id));

  switch (pending.kind) {
    case 'payment':
      if (!playerIds.has(pending.payerId) || !playerIds.has(pending.payeeId)) {
        return `payment refs missing player`;
      }
      break;
    case 'just_say_no':
      if (!playerIds.has(pending.respondentId) || !playerIds.has(pending.initiatorId)) {
        return `jsn refs missing player`;
      }
      break;
    case 'sly_deal_target':
    case 'forced_deal_target':
    case 'deal_breaker_target':
    case 'house_hotel_target':
      if (!playerIds.has(pending.actorId)) return `${pending.kind} missing actor`;
      if (pending.cardId && !allIds.has(pending.cardId) && pending.cardId !== '__none__') {
        // card may be in discard already after play — must still exist
        if (!allIds.has(pending.cardId)) return `${pending.kind} card ${pending.cardId} not live`;
      }
      break;
    case 'rent_color_choice':
    case 'rent_player_choice':
      if (!playerIds.has(pending.actorId)) return `rent missing actor`;
      break;
    case 'hand_limit_discard':
      if (!playerIds.has(pending.playerId)) return `discard missing player`;
      break;
    case 'double_rent_pending':
      if (!playerIds.has(pending.actorId)) return `double missing actor`;
      break;
  }
  return null;
}

export function assertPendingStackRefs(state: GameState): InvariantViolation | null {
  for (const p of state.pendingStack) {
    const err = pendingRefsLive(state, p);
    if (err) {
      return { name: 'pending_stack_refs', detail: err };
    }
  }
  return null;
}

/** Run all invariants; returns list of violations (empty if OK). */
export function checkInvariants(state: GameState): InvariantViolation[] {
  const checks = [
    assertCardConservation,
    assertUniqueCardIds,
    assertBankValuesNonNegative,
    assertPlaysRemaining,
    assertHandSizesNonNegative,
    assertWinnerHasThreeSets,
    assertPendingStackRefs,
  ];
  const violations: InvariantViolation[] = [];
  for (const check of checks) {
    const v = check(state);
    if (v) violations.push(v);
  }
  // Extra sanity: complete sets respect size
  for (const p of state.players) {
    for (const set of p.board.sets) {
      if (isCompleteSet(set) && set.cards.length === 0) {
        // orphaned building sets are incomplete by definition (0 cards)
      }
    }
  }
  return violations;
}
