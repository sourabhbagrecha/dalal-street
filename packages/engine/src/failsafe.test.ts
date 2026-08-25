/**
 * Liveness failsafe: a pending interaction that cannot be auto-resolved must
 * still be droppable, otherwise it blocks END_TURN for the rest of the game.
 */
import { describe, expect, it } from 'vitest';
import { dispatch } from './dispatch.js';
import { createGame } from './createGame.js';
import type { GameState } from '@monopoly-deal/shared';

function playing(): GameState {
  const { state } = createGame(['p1', 'p2'], 7);
  state.turnPhase = 'playing';
  state.drawnThisTurn = true;
  return state;
}

describe('FORCE_RESOLVE_PENDING', () => {
  it('drops a pending entry that blocks END_TURN', () => {
    const state = playing();
    state.pendingStack.push({
      kind: 'sly_deal_target',
      actorId: 'p1',
      cardId: 'nonexistent-card',
    });

    const blocked = dispatch(state, { type: 'END_TURN', playerId: 'p1' });
    expect(blocked.rejected).toBe('Cannot end turn with pending interactions');

    const forced = dispatch(blocked.state, {
      type: 'FORCE_RESOLVE_PENDING',
      playerId: 'p1',
    });
    expect(forced.rejected).toBeUndefined();
    expect(forced.state.pendingStack).toHaveLength(0);
    expect(forced.events.some((e) => e.type === 'action_cancelled')).toBe(true);

    const ended = dispatch(forced.state, { type: 'END_TURN', playerId: 'p1' });
    expect(ended.rejected).toBeUndefined();
    expect(ended.state.currentPlayerIndex).toBe(1);
  });

  it('clears every double_rent marker in one go', () => {
    const state = playing();
    state.pendingStack.push({
      kind: 'double_rent_pending',
      actorId: 'p1',
      doubleCardIds: ['a'],
    });
    state.pendingStack.push({
      kind: 'double_rent_pending',
      actorId: 'p1',
      doubleCardIds: ['b'],
    });
    state.pendingDoubles = 2;

    const forced = dispatch(state, { type: 'FORCE_RESOLVE_PENDING', playerId: 'p1' });
    expect(forced.state.pendingStack).toHaveLength(0);
    expect(forced.state.pendingDoubles).toBe(0);
  });

  it('rejects when there is nothing pending', () => {
    const state = playing();
    const result = dispatch(state, { type: 'FORCE_RESOLVE_PENDING', playerId: 'p1' });
    expect(result.rejected).toBe('No pending interaction');
  });
});
