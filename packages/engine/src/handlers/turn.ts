// Turn housekeeping: auto end, rearranging properties, hand-limit discard, ending and resuming a turn.
import type {
  DispatchResult,
  GameEvent,
  GameState,
  PropertyColor,
} from '@monopoly-deal/shared';
import { HAND_LIMIT, MAX_PLAYS } from '@monopoly-deal/shared';
import {
  canAssignWildToColor,
  currentPlayer,
  findCardInHand,
  findPropertyCard,
  getPlayer,
  isMulticolorWild,
  jokerMayJoin,
  placeOrphanedBuildings,
  placePropertyCard,
  removeCardFromBoard,
  removeFromHand,
} from '../board.js';
import { JOKER_NEEDS_SET, reject, checkWinner } from './common.js';

// Once a player has no plays left and every pending interaction has resolved
// (rent/birthday collected, Just Say No windows answered, etc.), end their turn
// automatically instead of waiting for an explicit END_TURN command.
export function maybeAutoEndTurn(state: GameState, events: GameEvent[]): void {
  if (state.turnPhase === 'game_over') return;
  if (!state.drawnThisTurn) return;
  if (state.playsRemaining > 0) return;
  const blocking = state.pendingStack.some((p) => p.kind !== 'double_rent_pending');
  if (blocking) return;

  state.pendingStack = state.pendingStack.filter((p) => p.kind !== 'double_rent_pending');
  state.pendingDoubles = 0;

  const player = currentPlayer(state);
  if (player.hand.length > HAND_LIMIT) {
    const excess = player.hand.length - HAND_LIMIT;
    state.pendingStack.push({ kind: 'hand_limit_discard', playerId: player.id, excess });
    state.turnPhase = 'awaiting_discard';
    events.push({
      type: 'discarded',
      playerId: player.id,
      message: `${player.id} must discard ${excess} card(s)`,
      data: { count: excess },
    });
    return;
  }

  advanceTurn(state, events);
}

export function handleRearrange(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  cardId: string,
  toColor: PropertyColor,
  toSetId?: string,
): DispatchResult {
  const blocking = state.pendingStack.filter((p) => p.kind !== 'double_rent_pending');
  if (blocking.length > 0) return reject(state, 'Cannot rearrange during pending');
  const player = currentPlayer(state);
  if (player.id !== playerId) return reject(state, 'Not your turn');
  if (state.turnPhase !== 'playing' && state.turnPhase !== 'awaiting_draw') {
    // Allow during own turn after draw
  }
  if (player.id !== currentPlayer(state).id) return reject(state, 'Not your turn');

  const found = findPropertyCard(player, cardId);
  if (!found) return reject(state, 'Card not on your board');
  const card = found.card;
  if (card.kind !== 'property_wild' && card.kind !== 'property') {
    return reject(state, 'Can only rearrange properties');
  }
  if (card.kind === 'property' && card.color !== toColor) {
    return reject(state, 'Natural property cannot change color');
  }
  if (card.kind === 'property_wild' && !canAssignWildToColor(card, toColor)) {
    return reject(state, 'Wild cannot be that color');
  }
  if (isMulticolorWild(card) && !jokerMayJoin(player.board.sets, toColor, toSetId, cardId)) {
    return reject(state, JOKER_NEEDS_SET);
  }

  const color = found.set.color;
  const { orphanedBuildings, brokeSet } = removeCardFromBoard(player, cardId);
  if (orphanedBuildings.length) placeOrphanedBuildings(player, orphanedBuildings, color);
  placePropertyCard(player, card, toColor, toSetId);
  // Does not consume a play
  events.push({
    type: 'rearranged',
    playerId,
    message: `${playerId} rearranged ${cardId} to ${toColor}`,
  });
  if (brokeSet) {
    events.push({
      type: 'set_broken',
      playerId,
      message: `Set broken by rearrange`,
      data: { color, reason: 'rearrange' },
    });
  }
  checkWinner(state, events);
  return { state, events };
}

export function handleDiscardExcess(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  cardIds: string[],
): DispatchResult {
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (!top || top.kind !== 'hand_limit_discard') {
    return reject(state, 'No hand-limit discard pending');
  }
  if (top.playerId !== playerId) return reject(state, 'Not your discard');
  if (cardIds.length !== top.excess) {
    return reject(state, `Must discard exactly ${top.excess} cards`);
  }

  const player = getPlayer(state, playerId);
  for (const id of cardIds) {
    if (!findCardInHand(player, id)) return reject(state, `Card ${id} not in hand`);
  }
  for (const id of cardIds) {
    const card = removeFromHand(player, id);
    state.discard.push(card);
  }
  state.pendingStack.pop();
  events.push({
    type: 'hand_limit_discard',
    playerId,
    message: `${playerId} discarded ${cardIds.length} excess card(s)`,
    data: { count: cardIds.length },
  });

  // Finish ending turn
  advanceTurn(state, events);
  return { state, events };
}

export function handleEndTurn(state: GameState, events: GameEvent[], playerId: string): DispatchResult {
  if (state.pendingStack.some((p) => p.kind !== 'double_rent_pending')) {
    return reject(state, 'Cannot end turn with pending interactions');
  }
  // Clear unused doubles
  state.pendingStack = state.pendingStack.filter((p) => p.kind !== 'double_rent_pending');
  state.pendingDoubles = 0;

  const player = currentPlayer(state);
  if (player.id !== playerId) return reject(state, 'Not your turn');
  if (!state.drawnThisTurn) return reject(state, 'Must draw before ending turn');

  if (player.hand.length > HAND_LIMIT) {
    const excess = player.hand.length - HAND_LIMIT;
    state.pendingStack.push({ kind: 'hand_limit_discard', playerId, excess });
    state.turnPhase = 'awaiting_discard';
    events.push({
      type: 'discarded',
      playerId,
      message: `${playerId} must discard ${excess} card(s)`,
      data: { count: excess },
    });
    return { state, events };
  }

  advanceTurn(state, events);
  return { state, events };
}

export function handleResumePlay(
  state: GameState,
  events: GameEvent[],
  playerId: string,
): DispatchResult {
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (!top || top.kind !== 'hand_limit_discard') {
    return reject(state, 'No discard pending');
  }
  if (top.playerId !== playerId) return reject(state, 'Not your discard');
  if (state.playsRemaining <= 0) {
    return reject(state, 'No plays remaining to resume');
  }

  state.pendingStack.pop();
  state.turnPhase = 'playing';
  events.push({
    type: 'turn_resumed',
    playerId,
    message: `${playerId} resumed playing instead of discarding`,
  });
  return { state, events };
}

function advanceTurn(state: GameState, events: GameEvent[]): void {
  events.push({
    type: 'turn_ended',
    playerId: currentPlayer(state).id,
    message: `${currentPlayer(state).id} ended their turn`,
  });
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.turnNumber += 1;
  state.playsRemaining = MAX_PLAYS;
  state.drawnThisTurn = false;
  state.turnPhase = 'awaiting_draw';
  state.pendingDoubles = 0;
}
