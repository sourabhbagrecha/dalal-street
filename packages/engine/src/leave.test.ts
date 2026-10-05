import { describe, expect, it } from 'vitest';
import { createGame } from './createGame.js';
import { dispatch } from './dispatch.js';

function total(s: ReturnType<typeof createGame>['state']): number {
  let n = s.deck.length + s.discard.length + s.outOfPlay.length;
  for (const p of s.players) {
    n += p.hand.length + p.board.bank.length;
    for (const set of p.board.sets) n += set.cards.length + (set.house ? 1 : 0) + (set.hotel ? 1 : 0);
  }
  return n;
}

describe('LEAVE_GAME', () => {
  it('moves the leaver\'s whole hand to the discard pile and closes the table up', () => {
    const { state } = createGame(['a', 'b', 'c'], 7);
    const before = total(state);
    const handSize = state.players[1]!.hand.length;
    const discardBefore = state.discard.length;
    const r = dispatch(state, { type: 'LEAVE_GAME', playerId: 'b' });
    expect(r.rejected).toBeUndefined();
    expect(r.state.players.map((p) => p.id)).toEqual(['a', 'c']);
    expect(r.state.discard.length).toBe(discardBefore + handSize);
    expect(total(r.state)).toBe(before);
    expect(r.state.currentPlayerIndex).toBe(0);
  });

  it('starts the next player\'s turn fresh when the current player leaves', () => {
    const { state } = createGame(['a', 'b', 'c'], 7);
    const r = dispatch(state, { type: 'LEAVE_GAME', playerId: 'a' });
    expect(r.state.players[r.state.currentPlayerIndex]!.id).toBe('b');
    expect(r.state.turnPhase).toBe('awaiting_draw');
    expect(r.state.drawnThisTurn).toBe(false);
  });

  it('ends the game when one player is left', () => {
    const { state } = createGame(['a', 'b'], 7);
    const r = dispatch(state, { type: 'LEAVE_GAME', playerId: 'a' });
    expect(r.state.winnerId).toBe('b');
    expect(r.state.turnPhase).toBe('game_over');
  });
});
