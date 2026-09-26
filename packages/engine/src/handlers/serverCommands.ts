// Server-driven commands: timer force-end and auto-resolve, connection changes, and who acts on a pending.
import type { DispatchResult, GameEvent, GameState } from '@monopoly-deal/shared';
import { HAND_LIMIT, MAX_PLAYS } from '@monopoly-deal/shared';
import { computeAutoDiscard, computeAutoPayment } from '../autoPayment.js';
import { currentPlayer, getPlayer, removeFromHand } from '../board.js';
import { reject } from './common.js';
import { handlePayment } from './payments.js';
import { handleDeclineJsn } from './justSayNo.js';
import { handleDiscardExcess } from './turn.js';

export function actingPlayerForPending(top: GameState['pendingStack'][number]): string | null {
  switch (top.kind) {
    case 'payment':
      return top.payerId;
    case 'payment_round': {
      const jsn = top.entries.find((e) => e.phase === 'jsn' && e.jsn);
      if (jsn?.jsn) return jsn.jsn.respondentId;
      const pay = top.entries.find((e) => e.phase === 'payment');
      return pay?.payerId ?? null;
    }
    case 'just_say_no':
      return top.respondentId;
    case 'hand_limit_discard':
      return top.playerId;
    case 'sly_deal_target':
    case 'forced_deal_target':
    case 'deal_breaker_target':
    case 'debt_collector_target':
    case 'rent_color_choice':
    case 'rent_player_choice':
    case 'house_hotel_target':
    case 'double_rent_pending':
      return top.actorId;
    default: {
      const _e: never = top;
      return _e;
    }
  }
}

export function handleForceEndTurn(
  state: GameState,
  events: GameEvent[],
  playerId: string,
): DispatchResult {
  const player = currentPlayer(state);
  if (player.id !== playerId) return reject(state, 'Not your turn');
  if (state.turnPhase === 'game_over') return reject(state, 'Game is over');

  const hard = state.pendingStack.filter((p) => p.kind !== 'double_rent_pending');
  const onlyOwnDiscard =
    hard.length === 1 &&
    hard[0]!.kind === 'hand_limit_discard' &&
    hard[0]!.playerId === playerId;
  if (hard.length > 0 && !onlyOwnDiscard) {
    return reject(state, 'Cannot force end turn while pending interactions');
  }

  state.pendingStack = state.pendingStack.filter((p) => p.kind !== 'double_rent_pending');
  state.pendingDoubles = 0;

  if (onlyOwnDiscard) {
    const top = state.pendingStack[state.pendingStack.length - 1];
    if (top?.kind === 'hand_limit_discard') {
      const ids = computeAutoDiscard(player.hand, top.excess);
      return handleDiscardExcess(state, events, playerId, ids);
    }
  }

  if (player.hand.length > HAND_LIMIT) {
    const excess = player.hand.length - HAND_LIMIT;
    const ids = computeAutoDiscard(player.hand, excess);
    for (const id of ids) {
      const card = removeFromHand(player, id);
      state.discard.push(card);
    }
    events.push({
      type: 'hand_limit_discard',
      playerId,
      message: `${playerId} auto-discarded ${ids.length} excess card(s)`,
      data: { count: ids.length },
    });
  }

  events.push({
    type: 'turn_ended',
    playerId,
    message: `${playerId} turn force-ended`,
    data: { forced: true },
  });
  // advanceTurn also pushes turn_ended — avoid duplicate by inlining advance without event
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.turnNumber += 1;
  state.playsRemaining = MAX_PLAYS;
  state.drawnThisTurn = false;
  state.turnPhase = 'awaiting_draw';
  state.pendingDoubles = 0;
  return { state, events };
}

function cancelTopPending(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  reason: string,
): DispatchResult {
  const top = state.pendingStack.pop();
  if (!top) return reject(state, 'No pending to cancel');
  events.push({
    type: 'action_cancelled',
    playerId,
    message: reason,
    data: { kind: top.kind, forced: true },
  });
  return { state, events };
}

export function handleAutoResolvePending(
  state: GameState,
  events: GameEvent[],
  playerId: string,
): DispatchResult {
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (!top) return reject(state, 'No pending interaction');

  // payment_round can have several seats acting in parallel — validate per entry.
  if (top.kind === 'payment_round') {
    const jsnEntry = top.entries.find(
      (e) => e.phase === 'jsn' && e.jsn?.respondentId === playerId,
    );
    if (jsnEntry) return handleDeclineJsn(state, events, playerId);
    const payEntry = top.entries.find(
      (e) => e.phase === 'payment' && e.payerId === playerId,
    );
    if (!payEntry) return reject(state, 'No payment pending for this player');
    const cardIds = computeAutoPayment(state, playerId, payEntry.amountDue);
    return handlePayment(state, events, playerId, cardIds);
  }

  const actor = actingPlayerForPending(top);
  if (actor !== playerId) return reject(state, 'Not your pending interaction');

  switch (top.kind) {
    case 'just_say_no':
      return handleDeclineJsn(state, events, playerId);
    case 'payment': {
      const cardIds = computeAutoPayment(state, playerId, top.amountDue);
      return handlePayment(state, events, playerId, cardIds);
    }
    case 'hand_limit_discard': {
      const ids = computeAutoDiscard(getPlayer(state, playerId).hand, top.excess);
      return handleDiscardExcess(state, events, playerId, ids);
    }
    case 'double_rent_pending': {
      state.pendingStack = state.pendingStack.filter((p) => p.kind !== 'double_rent_pending');
      state.pendingDoubles = 0;
      events.push({
        type: 'action_cancelled',
        playerId,
        message: `${playerId} unused Double the Rent cleared`,
        data: { kind: 'double_rent_pending', forced: true },
      });
      return { state, events };
    }
    case 'sly_deal_target':
    case 'forced_deal_target':
    case 'deal_breaker_target':
    case 'debt_collector_target':
    case 'rent_color_choice':
    case 'rent_player_choice':
    case 'house_hotel_target':
      return cancelTopPending(
        state,
        events,
        playerId,
        `${playerId} forfeited ${top.kind} (auto-resolve)`,
      );
    default: {
      const _e: never = top;
      return reject(state, `Cannot auto-resolve ${JSON.stringify(_e)}`);
    }
  }
}

export function handleConnectionChanged(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  connected: boolean,
): DispatchResult {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return reject(state, 'Unknown player');
  player.connected = connected;
  events.push({
    type: 'player_connection',
    playerId,
    message: `${playerId} ${connected ? 'reconnected' : 'disconnected'}`,
    data: { connected },
  });
  return { state, events };
}
