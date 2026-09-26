// Helpers every handler module shares: rejection, the win check, the Joker rule text.
import type { DispatchResult, GameEvent, GameState } from '@monopoly-deal/shared';
import { WIN_SETS } from '@monopoly-deal/shared';
import { countCompleteSets } from '../board.js';

export const JOKER_NEEDS_SET = 'A Joker can only join a set that is already started and not yet complete';

export function reject(state: GameState, reason: string): DispatchResult {
  return {
    state,
    events: [{ type: 'rejected', message: reason }],
    rejected: reason,
  };
}

export function checkWinner(state: GameState, events: GameEvent[]): void {
  for (const p of state.players) {
    if (countCompleteSets(p) >= WIN_SETS) {
      state.winnerId = p.id;
      state.turnPhase = 'game_over';
      events.push({
        type: 'winner',
        playerId: p.id,
        message: `${p.id} wins with ${countCompleteSets(p)} complete sets!`,
        data: { setCount: countCompleteSets(p) },
      });
      return;
    }
  }
}
