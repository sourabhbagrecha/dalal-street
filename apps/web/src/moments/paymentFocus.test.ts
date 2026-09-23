import { describe, expect, it } from 'vitest';
import { dispatch, fixtures, project } from '@monopoly-deal/engine';
import type { GameState } from '@monopoly-deal/shared';
import { viewerIsChoosingPayment } from './paymentFocus';

function mustDispatch(state: GameState, command: Parameters<typeof dispatch>[1]): GameState {
  const result = dispatch(state, command);
  if (result.rejected) throw new Error(`dispatch rejected: ${result.rejected}`);
  return result.state;
}

describe('viewerIsChoosingPayment', () => {
  const start = fixtures.debtCollectorChoice();
  const played = mustDispatch(start, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'dc1', zone: 'discard' });
  const charged = mustDispatch(played, {
    type: 'SELECT_DEBT_COLLECTOR_PLAYER',
    playerId: 'p1',
    targetPlayerId: 'p3',
  });

  it('is true only for the payer once their payment prompt is up', () => {
    expect(viewerIsChoosingPayment(project(charged, 'p3'))).toBe(true);
    expect(viewerIsChoosingPayment(project(charged, 'p1'))).toBe(false);
    expect(viewerIsChoosingPayment(project(charged, 'p2'))).toBe(false);
  });

  it('is false before anyone is charged', () => {
    expect(viewerIsChoosingPayment(project(played, 'p3'))).toBe(false);
  });

  it('covers every payer in a parallel payment round, never the payee', () => {
    const birthday = mustDispatch(fixtures.parallelBirthdayCollection(), {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: 'bd1',
      zone: 'discard',
    });
    for (const payer of ['p2', 'p3', 'p4']) {
      expect(viewerIsChoosingPayment(project(birthday, payer))).toBe(true);
    }
    expect(viewerIsChoosingPayment(project(birthday, 'p1'))).toBe(false);
  });
});
