/**
 * Scheduler deadline-rearm tests.
 *
 * Regression cover for the "turn wedges on `Cannot end turn with pending
 * interactions`" bug: an expired deadline is cleared by
 * `collectExpiredDeadlines`, but the auto-resolution it triggers can be
 * rejected by the engine (or resolve to an identical pending top). If
 * `syncDeadlinesFromState` only rearms on a *changed* signature, the timer
 * stays disarmed forever, the pending entry never resolves, and END_TURN is
 * rejected for the rest of the game.
 */
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import type { GameState, PendingInteraction } from '@monopoly-deal/shared';
import {
  collectExpiredDeadlines,
  createRoomDeadlines,
  syncDeadlinesFromState,
} from './scheduler.js';
import { resetTimingConfig, setTimingConfig } from './config.js';

function stateWith(pendingStack: PendingInteraction[]): GameState {
  return {
    players: [
      { id: 'p1', displayName: 'Alice', hand: [], bank: [], board: {}, connected: true },
      { id: 'p2', displayName: 'Bob', hand: [], bank: [], board: {}, connected: true },
    ],
    currentPlayerIndex: 0,
    turnNumber: 1,
    playsRemaining: 3,
    drawnThisTurn: true,
    turnPhase: 'playing',
    pendingStack,
    pendingDoubles: 0,
    deck: [],
    discard: [],
    log: [],
    seed: 1,
    rngState: 1,
  } as unknown as GameState;
}

describe('scheduler deadline rearm', () => {
  beforeEach(() => {
    setTimingConfig({ turnMs: 60_000, paymentMs: 30_000, jsnMs: 20_000, targetingMs: 30_000 });
  });
  afterEach(() => {
    resetTimingConfig();
  });

  it('rearms the pending deadline when the same pending survives its expiry', () => {
    const deadlines = createRoomDeadlines();
    const state = stateWith([
      { kind: 'payment', payerId: 'p2', payeeId: 'p1', amountDue: 2, reason: 'debt_collector' },
    ] as unknown as PendingInteraction[]);

    syncDeadlinesFromState(deadlines, state, 0);
    expect(deadlines.pendingDeadlineAt).toBe(30_000);

    const expired = collectExpiredDeadlines(deadlines, 30_000);
    expect(expired).toEqual([{ kind: 'pending', playerId: 'p2' }]);
    expect(deadlines.pendingDeadlineAt).toBeNull();

    // The auto-resolve was rejected by the engine: the pending top is unchanged.
    syncDeadlinesFromState(deadlines, state, 30_000);

    // Without a rearm the interaction can never expire again and the turn wedges.
    expect(deadlines.pendingDeadlineAt).not.toBeNull();
    expect(deadlines.pendingPlayerId).toBe('p2');
  });

  it('rearms the turn deadline when FORCE_END_TURN is rejected', () => {
    const deadlines = createRoomDeadlines();
    const state = stateWith([
      { kind: 'payment', payerId: 'p2', payeeId: 'p1', amountDue: 2, reason: 'debt_collector' },
    ] as unknown as PendingInteraction[]);

    syncDeadlinesFromState(deadlines, state, 0);
    expect(deadlines.turnDeadlineAt).toBe(60_000);

    const expired = collectExpiredDeadlines(deadlines, 60_000);
    expect(expired.some((e) => e.kind === 'turn')).toBe(true);
    expect(deadlines.turnDeadlineAt).toBeNull();

    // FORCE_END_TURN was rejected ("Cannot force end turn while pending
    // interactions"), so p1 is still the current player.
    syncDeadlinesFromState(deadlines, state, 60_000);

    expect(deadlines.turnDeadlineAt).not.toBeNull();
    expect(deadlines.turnPlayerId).toBe('p1');
  });

  it('restarts the timer when a payment_round advances to a new phase for the same seat', () => {
    const deadlines = createRoomDeadlines();
    const jsnPhase = stateWith([
      {
        kind: 'payment_round',
        payeeId: 'p1',
        reason: 'debt_collector',
        entries: [
          {
            payerId: 'p2',
            amountDue: 2,
            phase: 'jsn',
            jsn: { respondentId: 'p2', cardId: 'c1', actorId: 'p1' },
          },
        ],
      },
    ] as unknown as PendingInteraction[]);

    syncDeadlinesFromState(deadlines, jsnPhase, 0);
    expect(deadlines.pendingDeadlineAt).toBe(20_000); // jsn window

    // p2 declined Just Say No; the same seat now owes the payment. Same kind,
    // same actor, same stack depth — but a brand new 30s window is owed.
    const payPhase = stateWith([
      {
        kind: 'payment_round',
        payeeId: 'p1',
        reason: 'debt_collector',
        entries: [{ payerId: 'p2', amountDue: 2, phase: 'payment' }],
      },
    ] as unknown as PendingInteraction[]);

    syncDeadlinesFromState(deadlines, payPhase, 5_000);
    expect(deadlines.pendingDeadlineAt).toBe(35_000);
  });

  it('does not restart a live timer while the pending is unchanged', () => {
    const deadlines = createRoomDeadlines();
    const state = stateWith([
      { kind: 'payment', payerId: 'p2', payeeId: 'p1', amountDue: 2, reason: 'debt_collector' },
    ] as unknown as PendingInteraction[]);

    syncDeadlinesFromState(deadlines, state, 0);
    expect(deadlines.pendingDeadlineAt).toBe(30_000);

    // A projection tick 10s later must not hand the payer a fresh 30s.
    syncDeadlinesFromState(deadlines, state, 10_000);
    expect(deadlines.pendingDeadlineAt).toBe(30_000);
  });
});
