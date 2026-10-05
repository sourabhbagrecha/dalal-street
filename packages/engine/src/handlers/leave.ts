// A player walks out mid-game: every card they hold goes to the discard pile (so the draw pile can reshuffle it back
// in), anything pending that needed them is dropped, and the table closes up around the empty chair.
import type { Card, DispatchResult, GameEvent, GameState, PendingInteraction } from '@monopoly-deal/shared';
import { MAX_PLAYS } from '@monopoly-deal/shared';
import { reject } from './common.js';

/** Whether a pending interaction cannot go on without `playerId` (their answer or their money is the point of it). */
function dependsOn(p: PendingInteraction, playerId: string): boolean {
  switch (p.kind) {
    case 'payment':
      return p.payerId === playerId || p.payeeId === playerId;
    case 'payment_round':
      return p.payeeId === playerId;
    case 'just_say_no':
      return (
        p.respondentId === playerId ||
        p.initiatorId === playerId ||
        p.contestedAction.actorId === playerId ||
        p.contestedAction.targetPlayerId === playerId
      );
    case 'hand_limit_discard':
      return p.playerId === playerId;
    case 'sly_deal_target':
    case 'forced_deal_target':
    case 'deal_breaker_target':
    case 'debt_collector_target':
    case 'rent_color_choice':
    case 'rent_player_choice':
    case 'house_hotel_target':
    case 'double_rent_pending':
      return p.actorId === playerId;
    default: {
      const _e: never = p;
      return _e;
    }
  }
}

function toDiscard(state: GameState, card: Card): void {
  if (card.kind === 'property_wild') delete card.assignedColor;
  state.discard.push(card);
}

export function handleLeaveGame(state: GameState, events: GameEvent[], playerId: string): DispatchResult {
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return reject(state, 'Unknown player');
  const leaver = state.players[idx]!;

  let cardCount = 0;
  const release = (card: Card | undefined): void => {
    if (!card) return;
    toDiscard(state, card);
    cardCount += 1;
  };
  leaver.hand.forEach(release);
  leaver.board.bank.forEach(release);
  for (const set of leaver.board.sets) {
    set.cards.forEach(release);
    release(set.house);
    release(set.hotel);
  }

  // Pendings that needed them are cancelled; a payment round only loses their own line.
  state.pendingStack = state.pendingStack.filter((p) => !dependsOn(p, playerId));
  for (const p of state.pendingStack) {
    if (p.kind !== 'payment_round') continue;
    for (const e of p.entries) {
      if (e.payerId === playerId) e.phase = 'skipped';
    }
  }
  state.pendingStack = state.pendingStack.filter(
    (p) => p.kind !== 'payment_round' || p.entries.some((e) => e.phase === 'jsn' || e.phase === 'payment'),
  );
  if (!state.pendingStack.some((p) => p.kind === 'double_rent_pending')) state.pendingDoubles = 0;

  const wasTheirTurn = state.currentPlayerIndex === idx;
  state.players.splice(idx, 1);
  if (idx < state.currentPlayerIndex) state.currentPlayerIndex -= 1;
  if (state.currentPlayerIndex >= state.players.length) state.currentPlayerIndex = 0;

  events.push({
    type: 'player_left',
    playerId,
    message: `${playerId} left the game`,
    data: { cards: cardCount },
  });

  if (state.players.length <= 1) {
    const last = state.players[0];
    state.winnerId = last?.id ?? null;
    state.turnPhase = 'game_over';
    state.pendingStack = [];
    state.pendingDoubles = 0;
    if (last) {
      events.push({
        type: 'winner',
        playerId: last.id,
        message: `${last.id} wins — everyone else left`,
        data: { setCount: 0, byForfeit: true },
      });
    }
    return { state, events };
  }

  if (wasTheirTurn) {
    // The chair that followed them now sits at the same index: their turn starts fresh.
    state.turnNumber += 1;
    state.playsRemaining = MAX_PLAYS;
    state.drawnThisTurn = false;
    state.turnPhase = 'awaiting_draw';
    // Everything still pending grew out of their plays, so it goes with them.
    state.pendingStack = [];
    state.pendingDoubles = 0;
  }
  return { state, events };
}
