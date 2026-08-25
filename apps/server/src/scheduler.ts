import type { ClientDeadlines, GameState, PendingInteraction } from '@monopoly-deal/shared';
import { getTimingConfig } from './config.js';

export interface RoomDeadlines {
  turnDeadlineAt: number | null;
  turnPlayerId: string | null;
  pendingDeadlineAt: number | null;
  pendingPlayerId: string | null;
  /** Detects pending-stack changes so timers restart. */
  pendingSignature: string | null;
  disconnectGrace: Map<string, number>;
}

export function createRoomDeadlines(): RoomDeadlines {
  return {
    turnDeadlineAt: null,
    turnPlayerId: null,
    pendingDeadlineAt: null,
    pendingPlayerId: null,
    pendingSignature: null,
    disconnectGrace: new Map(),
  };
}

/**
 * Snapshot of "what the stack currently owes". Used to detect whether an
 * auto-resolution actually moved the game on, or was rejected in place.
 */
export function pendingFingerprint(state: GameState): string {
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (!top) return '';
  return `${state.pendingStack.length}:${JSON.stringify(top)}`;
}

export function actingPlayerForPending(top: PendingInteraction): string | null {
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
      const _exhaustive: never = top;
      return _exhaustive;
    }
  }
}

/**
 * Identifies "the thing currently being waited on". Any change here restarts the
 * window. It must capture the *phase* of a payment_round too: a round that moves
 * from the Just Say No phase to the payment phase for the same seat keeps the
 * same kind, actor and stack depth, but owes a brand new window.
 */
function pendingSignature(top: PendingInteraction, depth: number): string | null {
  const actor = actingPlayerForPending(top);
  const timeout = pendingTimeoutMs(top);
  if (!actor || timeout === null) return null;

  let detail = '';
  if (top.kind === 'payment_round') {
    detail = top.entries
      .map((e) => `${e.payerId}/${e.phase}/${e.jsn?.respondentId ?? ''}`)
      .sort()
      .join(',');
  }
  return `${top.kind}:${actor}:${depth}:${detail}`;
}

function pendingTimeoutMs(pending: PendingInteraction): number | null {
  const timing = getTimingConfig();
  switch (pending.kind) {
    case 'just_say_no':
      return timing.jsnMs;
    case 'payment':
      return timing.paymentMs;
    case 'payment_round': {
      const jsn = pending.entries.find((e) => e.phase === 'jsn' && e.jsn);
      if (jsn) return timing.jsnMs;
      const pay = pending.entries.find((e) => e.phase === 'payment');
      if (pay) return timing.paymentMs;
      return null;
    }
    case 'hand_limit_discard':
    case 'double_rent_pending':
      return null;
    default:
      return timing.targetingMs;
  }
}

export function syncDeadlinesFromState(
  deadlines: RoomDeadlines,
  state: GameState,
  now: number,
): void {
  const timing = getTimingConfig();

  if (state.turnPhase === 'game_over') {
    deadlines.turnDeadlineAt = null;
    deadlines.turnPlayerId = null;
    deadlines.pendingDeadlineAt = null;
    deadlines.pendingPlayerId = null;
    return;
  }

  const current = state.players[state.currentPlayerIndex];
  if (current) {
    // Rearm on a seat change, and also whenever the turn is live but unarmed:
    // `collectExpiredDeadlines` nulls the deadline when it fires, and the
    // FORCE_END_TURN it triggers can be rejected (it refuses while a hard
    // pending interaction is outstanding). Without this second condition the
    // turn timer would stay dead for the rest of the game.
    if (deadlines.turnPlayerId !== current.id || deadlines.turnDeadlineAt === null) {
      deadlines.turnPlayerId = current.id;
      deadlines.turnDeadlineAt = now + timing.turnMs;
    }
  } else {
    deadlines.turnDeadlineAt = null;
    deadlines.turnPlayerId = null;
  }

  const top = state.pendingStack[state.pendingStack.length - 1];
  if (top) {
    const signature = pendingSignature(top, state.pendingStack.length);
    // Same rearm rule as the turn clock: a signature that survived its own
    // expiry (auto-resolution rejected, or resolved into an identical top) must
    // get a fresh window, or the interaction can never expire again and every
    // END_TURN is rejected with "Cannot end turn with pending interactions".
    const stale = signature !== null && deadlines.pendingDeadlineAt === null;
    if (signature !== deadlines.pendingSignature || stale) {
      deadlines.pendingSignature = signature;
      if (signature !== null) {
        deadlines.pendingPlayerId = actingPlayerForPending(top);
        deadlines.pendingDeadlineAt = now + (pendingTimeoutMs(top) ?? 0);
      } else {
        deadlines.pendingDeadlineAt = null;
        deadlines.pendingPlayerId = null;
      }
    }
  } else {
    deadlines.pendingSignature = null;
    deadlines.pendingDeadlineAt = null;
    deadlines.pendingPlayerId = null;
  }
}

export function computeClientDeadlines(
  deadlines: RoomDeadlines,
  now: number,
): ClientDeadlines {
  const result: ClientDeadlines = {};

  if (deadlines.turnDeadlineAt !== null) {
    result.turnMs = Math.max(0, deadlines.turnDeadlineAt - now);
  }
  if (deadlines.pendingDeadlineAt !== null) {
    result.pendingMs = Math.max(0, deadlines.pendingDeadlineAt - now);
  }
  if (deadlines.disconnectGrace.size > 0) {
    result.disconnectGraceMs = {};
    for (const [playerId, deadlineAt] of deadlines.disconnectGrace) {
      result.disconnectGraceMs[playerId] = Math.max(0, deadlineAt - now);
    }
  }

  return result;
}

export interface ExpiredDeadline {
  kind: 'turn' | 'pending' | 'disconnect';
  playerId: string;
}

export function collectExpiredDeadlines(
  deadlines: RoomDeadlines,
  now: number,
): ExpiredDeadline[] {
  const expired: ExpiredDeadline[] = [];

  if (
    deadlines.turnDeadlineAt !== null &&
    deadlines.turnPlayerId &&
    now >= deadlines.turnDeadlineAt
  ) {
    expired.push({ kind: 'turn', playerId: deadlines.turnPlayerId });
    deadlines.turnDeadlineAt = null;
  }

  if (
    deadlines.pendingDeadlineAt !== null &&
    deadlines.pendingPlayerId &&
    now >= deadlines.pendingDeadlineAt
  ) {
    expired.push({ kind: 'pending', playerId: deadlines.pendingPlayerId });
    deadlines.pendingDeadlineAt = null;
    deadlines.pendingPlayerId = null;
  }

  for (const [playerId, deadlineAt] of [...deadlines.disconnectGrace]) {
    if (now >= deadlineAt) {
      expired.push({ kind: 'disconnect', playerId });
      deadlines.disconnectGrace.delete(playerId);
    }
  }

  return expired;
}

export function startDisconnectGrace(
  deadlines: RoomDeadlines,
  playerId: string,
  now: number,
): void {
  const timing = getTimingConfig();
  deadlines.disconnectGrace.set(playerId, now + timing.disconnectGraceMs);
}

export function clearDisconnectGrace(
  deadlines: RoomDeadlines,
  playerId: string,
): void {
  deadlines.disconnectGrace.delete(playerId);
}
