// Just Say No chains: playing or declining a Just Say No, on a single window or a payment-round entry.
import type {
  DispatchResult,
  GameEvent,
  GameState,
  PaymentRoundEntry,
} from '@monopoly-deal/shared';
import { findCardInHand, getPlayer, removeFromHand } from '../board.js';
import { reject } from './common.js';
import { emitObligationProceedEvents, tryCompletePaymentRound } from './payments.js';
import { resolveContestedAction } from './contested.js';

function finishRoundEntryJsn(
  events: GameEvent[],
  entry: PaymentRoundEntry,
  cancelled: boolean,
  deciderId: string,
): void {
  if (!entry.jsn) return;
  const contested = entry.jsn.contestedAction;
  if (cancelled) {
    entry.phase = 'skipped';
    entry.jsn = undefined;
    events.push({
      type: 'action_cancelled',
      playerId: contested.actorId,
      message: `Action ${contested.type} cancelled by Just Say No`,
      data: { contested, by: deciderId },
    });
    return;
  }
  entry.phase = 'payment';
  entry.jsn = undefined;
  emitObligationProceedEvents(events, contested, entry.amountDue);
}

function handleRoundJsn(
  state: GameState,
  events: GameEvent[],
  entry: PaymentRoundEntry,
  playerId: string,
  cardId: string,
): DispatchResult {
  if (!entry.jsn || entry.jsn.respondentId !== playerId) {
    return reject(state, 'Not your Just Say No window');
  }

  const player = getPlayer(state, playerId);
  const card = findCardInHand(player, cardId);
  if (!card || card.kind !== 'action' || card.action !== 'just_say_no') {
    return reject(state, 'Must play Just Say No card');
  }

  removeFromHand(player, cardId);
  state.discard.push(card);

  const jsnCount = entry.jsn.jsnCount + 1;
  const contested = entry.jsn.contestedAction;
  events.push({
    type: 'just_say_no',
    playerId,
    message: `${playerId} played Just Say No (chain ${jsnCount})`,
    data: {
      chain: jsnCount,
      contestedType: contested.type,
      contestedActorId: contested.actorId,
      contestedTargetId: contested.targetPlayerId,
    },
  });

  const nextRespondent =
    playerId === contested.actorId ? contested.targetPlayerId! : contested.actorId;
  const canCounter = getPlayer(state, nextRespondent).hand.some(
    (c) => c.kind === 'action' && c.action === 'just_say_no',
  );

  if (canCounter) {
    entry.jsn.respondentId = nextRespondent;
    entry.jsn.initiatorId = playerId;
    entry.jsn.jsnCount = jsnCount;
  } else {
    // playerId just played the Just Say No the other side cannot counter, so
    // their card is the one deciding the outcome.
    finishRoundEntryJsn(events, entry, jsnCount % 2 === 1, playerId);
    tryCompletePaymentRound(state);
  }

  return { state, events };
}

function handleRoundDeclineJsn(
  state: GameState,
  events: GameEvent[],
  entry: PaymentRoundEntry,
  playerId: string,
): DispatchResult {
  if (!entry.jsn || entry.jsn.respondentId !== playerId) {
    return reject(state, 'Not your Just Say No window');
  }

  events.push({
    type: 'just_say_no_declined',
    playerId,
    message: `${playerId} declined Just Say No`,
  });

  // playerId (the current respondent) is declining rather than countering, so
  // they are not the decider — entry.jsn.initiatorId is whoever last played a
  // Just Say No into this chain (or the original actor when jsnCount is 0, in
  // which case cancelled is false below and `by` goes unused).
  finishRoundEntryJsn(events, entry, entry.jsn.jsnCount % 2 === 1, entry.jsn.initiatorId);
  tryCompletePaymentRound(state);
  return { state, events };
}

export function handleJsn(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  cardId: string,
): DispatchResult {
  const top = state.pendingStack[state.pendingStack.length - 1];

  if (top?.kind === 'payment_round') {
    const entry = top.entries.find((e) => e.phase === 'jsn' && e.jsn?.respondentId === playerId);
    if (!entry) return reject(state, 'No Just Say No pending');
    return handleRoundJsn(state, events, entry, playerId, cardId);
  }

  if (!top || top.kind !== 'just_say_no') return reject(state, 'No Just Say No pending');
  if (top.respondentId !== playerId) return reject(state, 'Not your Just Say No window');

  const player = getPlayer(state, playerId);
  const card = findCardInHand(player, cardId);
  if (!card || card.kind !== 'action' || card.action !== 'just_say_no') {
    return reject(state, 'Must play Just Say No card');
  }

  removeFromHand(player, cardId);
  state.discard.push(card);
  // Does NOT consume a play

  const jsnCount = top.jsnCount + 1;
  events.push({
    type: 'just_say_no',
    playerId,
    message: `${playerId} played Just Say No (chain ${jsnCount})`,
    data: {
      chain: jsnCount,
      contestedType: top.contestedAction.type,
      contestedActorId: top.contestedAction.actorId,
      contestedTargetId: top.contestedAction.targetPlayerId,
    },
  });

  // Pop current JSN pending
  state.pendingStack.pop();

  // Special: JSN against Double the Rent — negate one double
  if (top.contestedAction.type === 'double_the_rent') {
    // odd jsnCount means cancelled
    if (jsnCount % 2 === 1) {
      state.pendingDoubles = Math.max(0, state.pendingDoubles - 1);
      events.push({
        type: 'action_cancelled',
        message: 'Double the Rent negated; original rent still applies if played',
      });
    }
    return { state, events };
  }

  // Offer counter-JSN to the other party
  const nextRespondent =
    playerId === top.contestedAction.actorId
      ? top.contestedAction.targetPlayerId!
      : top.contestedAction.actorId;

  const nextPlayer = getPlayer(state, nextRespondent);
  const canCounter = nextPlayer.hand.some(
    (c) => c.kind === 'action' && c.action === 'just_say_no',
  );

  if (canCounter) {
    state.pendingStack.push({
      kind: 'just_say_no',
      respondentId: nextRespondent,
      initiatorId: playerId,
      contestedAction: top.contestedAction,
      jsnCount,
    });
  } else {
    // Chain ends: odd = cancelled, even = proceeds. playerId just played the
    // Just Say No nobody can counter, so they are the decider.
    const cancelled = jsnCount % 2 === 1;
    resolveContestedAction(state, events, top.contestedAction, cancelled, playerId);
  }

  return { state, events };
}

export function handleDeclineJsn(
  state: GameState,
  events: GameEvent[],
  playerId: string,
): DispatchResult {
  const top = state.pendingStack[state.pendingStack.length - 1];

  if (top?.kind === 'payment_round') {
    const entry = top.entries.find((e) => e.phase === 'jsn' && e.jsn?.respondentId === playerId);
    if (!entry) return reject(state, 'No Just Say No pending');
    return handleRoundDeclineJsn(state, events, entry, playerId);
  }

  if (!top || top.kind !== 'just_say_no') return reject(state, 'No Just Say No pending');
  if (top.respondentId !== playerId) return reject(state, 'Not your Just Say No window');

  state.pendingStack.pop();
  events.push({
    type: 'just_say_no_declined',
    playerId,
    message: `${playerId} declined Just Say No`,
  });

  // jsnCount even (including 0) → action proceeds; odd → cancelled
  const cancelled = top.jsnCount % 2 === 1;
  // playerId (top.respondentId) is declining rather than countering, so they
  // are not the decider — top.initiatorId is whoever last played a Just Say No
  // into this chain (or the original actor when jsnCount is 0, in which case
  // cancelled is false and `by` goes unused).
  resolveContestedAction(state, events, top.contestedAction, cancelled, top.initiatorId);
  return { state, events };
}
