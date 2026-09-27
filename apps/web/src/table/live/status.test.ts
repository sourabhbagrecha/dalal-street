import { describe, expect, it } from 'vitest';
import { fixtures } from '@monopoly-deal/engine';
import type { GameState } from '@monopoly-deal/shared';
import { derivePrompt } from './prompts';
import { deriveWait, pendingWindowSecs } from './status';
import { actionCard, promptDeps, step, view, withHand } from './testkit';

// The fixtures seat Aarav (p1), Priya (p2), Marcus (p3), Yuki (p4).
const wait = (state: GameState, viewer: string): string | null => {
  const client = view(state, viewer);
  return deriveWait(client, derivePrompt(client, { give: null, paySel: [], discardSel: [] }, promptDeps(state)));
};
const play = (state: GameState, playerId: string, cardId: string): GameState =>
  step(state, { type: 'PLAY_CARD', playerId, cardId, zone: 'discard' });

describe('deriveWait', () => {
  it('is null when nothing is pending', () => {
    expect(wait(fixtures.responsiveMidGame(), 'p2')).toBeNull();
  });

  it('is null for the one who owes the choice (their prompt speaks) and set for everyone else', () => {
    const state = play(fixtures.responsiveMidGame(), 'p1', 'sd1');
    expect(wait(state, 'p1')).toBeNull();
    expect(wait(state, 'p2')).toBe('Aarav is choosing a property to take…');
  });

  it('who is picking who pays', () => {
    const state = play(fixtures.debtCollectorChoice(), 'p1', 'dc1');
    expect(wait(state, 'p3')).toBe('Aarav is choosing who pays…');
  });

  it('who is paying', () => {
    const state = step(play(fixtures.debtCollectorChoice(), 'p1', 'dc1'), {
      type: 'SELECT_DEBT_COLLECTOR_PLAYER',
      playerId: 'p1',
      targetPlayerId: 'p2',
    });
    expect(wait(state, 'p1')).toBe('Waiting on Priya to pay');
    expect(wait(state, 'p2')).toBeNull();
    expect(wait(state, 'p3')).toBe('Waiting on Priya to pay');
  });

  it('a payment round lists every payer still to pay', () => {
    const state = play(fixtures.parallelRentCollection(), 'p1', 'rent_brown_lb');
    expect(wait(state, 'p1')).toBe('Waiting on Priya, Marcus, Yuki to pay');
    // Priya owes something herself, so she gets a prompt and no wait line.
    expect(wait(state, 'p2')).toBeNull();
  });

  it('who may Just Say No — and a payer is only ever paying, whoever holds one', () => {
    const start = withHand(fixtures.standardMidGame(), 'p1', [actionCard('bd1', 'its_my_birthday', 2)]);
    const state = play(start, 'p1', 'bd1');
    // Priya holds a Just Say No and Marcus does not: both read as paying.
    expect(wait(state, 'p1')).toBe('Waiting on Priya, Marcus to pay');
    expect(wait(state, 'p3')).toBeNull(); // Marcus pays, so he has his own prompt
    const said = step(state, { type: 'RESPOND_JUST_SAY_NO', playerId: 'p2', cardId: 'jsn1' });
    expect(wait(said, 'p4')).toBe('Aarav may Just Say No…'); // Yuki owes nothing, so she only watches

    const chain = structuredClone(fixtures.doubleJustSayNoChain());
    expect(wait(chain, 'p1')).toBe('Waiting on Priya to pay');
    expect(wait(chain, 'p3')).toBe('Waiting on Priya to pay');
    expect(wait(chain, 'p2')).toBeNull();

    const steal = step(play(fixtures.responsiveMidGame(), 'p1', 'sd1'), { type: 'SELECT_STEAL_TARGET', playerId: 'p1', targetCardId: 'u1' });
    expect(wait(steal, 'p2')).toBe('Marcus may Just Say No…');
  });

  it('who is discarding', () => {
    expect(wait(fixtures.overHandLimit(), 'p2')).toBe('Aarav is discarding');
    expect(wait(fixtures.overHandLimit(), 'p1')).toBeNull();
  });

  it('is null once someone has won', () => {
    const state = { ...play(fixtures.responsiveMidGame(), 'p1', 'sd1'), winnerId: 'p1' };
    expect(wait(state, 'p2')).toBeNull();
  });
});

describe('pendingWindowSecs', () => {
  const secs = (state: GameState) => pendingWindowSecs(view(state, 'p1'));

  it('follows the fixed server windows', () => {
    expect(secs(fixtures.responsiveMidGame())).toBeNull();
    expect(secs(fixtures.doubleJustSayNoChain())).toBe(20);
    expect(secs(fixtures.payBreaksCompletedSet())).toBe(30);
    expect(secs(play(fixtures.responsiveMidGame(), 'p1', 'sd1'))).toBe(30);
    expect(secs(fixtures.overHandLimit())).toBeNull();
  });

  it('a payment round runs the Just Say No window while anyone can still answer, then the payment window', () => {
    const start = withHand(fixtures.standardMidGame(), 'p1', [actionCard('bd1', 'its_my_birthday', 2)]);
    expect(secs(play(start, 'p1', 'bd1'))).toBe(20);
    let rent = play(fixtures.parallelRentCollection(), 'p1', 'rent_brown_lb');
    expect(secs(rent)).toBe(20);
    for (const playerId of ['p2', 'p3', 'p4']) rent = step(rent, { type: 'DECLINE_JUST_SAY_NO', playerId });
    expect(secs(rent)).toBe(30);
  });
});
