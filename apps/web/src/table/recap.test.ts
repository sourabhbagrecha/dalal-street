import { describe, expect, it } from 'vitest';
import { dispatch, fixtures, project } from '@monopoly-deal/engine';
import type { GameEvent, GameState } from '@monopoly-deal/shared';
import type { LogEntry } from '../store/types';
import { computeRecap } from './recap';

function toEntries(events: GameEvent[]): LogEntry[] {
  return events.map((e, i) => ({ ...e, id: i + 1, at: '' }));
}

function mustDispatch(state: GameState, command: Parameters<typeof dispatch>[1]): { state: GameState; events: GameEvent[] } {
  const result = dispatch(state, command);
  if (result.rejected) throw new Error(`dispatch rejected: ${result.rejected}`);
  return { state: result.state, events: result.events };
}

describe('computeRecap', () => {
  it('is all zeroes/null before anything has happened', () => {
    const start = fixtures.responsiveMidGame();
    const clientState = project(start, 'p1');
    expect(computeRecap([], clientState)).toEqual({
      turns: clientState.turnNumber,
      steals: 0,
      jsnSaves: 0,
      biggestRent: null,
    });
  });

  it('counts a sly_deal as a steal', () => {
    const start = fixtures.responsiveMidGame();
    const step1 = mustDispatch(start, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'sd1', zone: 'discard' });
    const step2 = mustDispatch(step1.state, { type: 'SELECT_STEAL_TARGET', playerId: 'p1', targetCardId: 'u1' });
    const step3 = mustDispatch(step2.state, { type: 'DECLINE_JUST_SAY_NO', playerId: 'p3' });
    const entries = toEntries([...step1.events, ...step2.events, ...step3.events]);
    const clientState = project(step3.state, 'p1');

    const recap = computeRecap(entries, clientState);
    expect(recap.steals).toBe(1);
    expect(recap.turns).toBe(clientState.turnNumber);
  });

  it('counts a Just Say No play', () => {
    const start = fixtures.doubleJustSayNoChain();
    const step1 = mustDispatch(start, { type: 'RESPOND_JUST_SAY_NO', playerId: 'p2', cardId: 'jsn_b' });
    const entries = toEntries(step1.events);
    const clientState = project(step1.state, 'p2');

    expect(computeRecap(entries, clientState).jsnSaves).toBe(1);
  });

  it('finds the biggest rent charge, attributed to whoever charged it', () => {
    // p1 owns only one of the card's two colours (brown), so the engine picks it without a prompt.
    const start = fixtures.parallelRentCollection();
    const step1 = mustDispatch(start, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'rent_brown_lb', zone: 'discard' });
    const entries = toEntries(step1.events);
    const clientState = project(step1.state, 'p1');

    const recap = computeRecap(entries, clientState);
    expect(recap.biggestRent).not.toBeNull();
    expect(recap.biggestRent?.byId).toBe('p1');
    expect(recap.biggestRent?.amount).toBeGreaterThan(0);
  });
});
