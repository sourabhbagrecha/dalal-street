import { describe, expect, it } from 'vitest';
import { dispatch, fixtures, project } from '@monopoly-deal/engine';
import type { GameEvent, GameState } from '@monopoly-deal/shared';
import type { LogEntry } from '../store/types';
import { theme } from '../theme';
import { calloutCopyFor, perspectiveFor } from './copy';
import { deriveMoments } from './derive';
import type { Moment } from './types';

const formatMoney = (n: number) => theme.formatMoney(n);

function toEntries(events: GameEvent[]): LogEntry[] {
  return events.map((e, i) => ({ ...e, id: i + 1, at: '' }));
}

function mustDispatch(state: GameState, command: Parameters<typeof dispatch>[1]): { state: GameState; events: GameEvent[] } {
  const result = dispatch(state, command);
  if (result.rejected) throw new Error(`dispatch rejected: ${result.rejected}`);
  return { state: result.state, events: result.events };
}

function momentOf(kind: Moment['kind'], entries: LogEntry[], state: GameState, viewerId: string): Moment {
  const clientState = project(state, viewerId);
  const moments = deriveMoments(entries, clientState, { now: 1000, viewerId, mode: 'local' });
  const found = moments.find((m) => m.kind === kind);
  if (!found) throw new Error(`no ${kind} moment derived`);
  return found;
}

describe('calloutCopyFor — sly_deal (brief worked example: Aarav sly-deals Marcus\'s Agra)', () => {
  const start = fixtures.responsiveMidGame();
  const step1 = mustDispatch(start, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'sd1', zone: 'discard' });
  const step2 = mustDispatch(step1.state, {
    type: 'SELECT_STEAL_TARGET',
    playerId: 'p1',
    targetCardId: 'u1',
  });
  const entries = toEntries([...step1.events, ...step2.events]);

  it('victim (p3 / Marcus): danger tone, "took your"', () => {
    const clientState = project(step2.state, 'p3');
    const moment = momentOf('sly_deal', entries, step2.state, 'p3');
    const copy = calloutCopyFor(moment, clientState, formatMoney);
    expect(copy.headline).toBe('SLY DEAL!');
    expect(copy.detail).toBe('Aarav took your Agra');
    expect(copy.tone).toBe('danger');
    expect(copy.perspective).toBe('victim');
    expect(perspectiveFor(moment, 'p3')).toBe('victim');
  });

  it('actor (p1 / Aarav): success tone, "You took"', () => {
    const clientState = project(step2.state, 'p1');
    const moment = momentOf('sly_deal', entries, step2.state, 'p1');
    const copy = calloutCopyFor(moment, clientState, formatMoney);
    expect(copy.detail).toBe("You took Marcus's Agra");
    expect(copy.tone).toBe('success');
    expect(copy.perspective).toBe('actor');
  });

  it('spectator (p2 / Priya): neutral tone, third-person', () => {
    const clientState = project(step2.state, 'p2');
    const moment = momentOf('sly_deal', entries, step2.state, 'p2');
    const copy = calloutCopyFor(moment, clientState, formatMoney);
    expect(copy.detail).toBe('Aarav took Agra from Marcus');
    expect(copy.tone).toBe('neutral');
    expect(copy.perspective).toBe('spectator');
  });
});

describe('calloutCopyFor — deal_breaker', () => {
  const start = fixtures.dealBreakerOnSetWithHotel();
  const step1 = mustDispatch(start, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'dbk1', zone: 'discard' });
  const step2 = mustDispatch(step1.state, {
    type: 'SELECT_STEAL_TARGET',
    playerId: 'p1',
    targetSetId: 'set_yellow_full',
  });
  const entries = toEntries([...step1.events, ...step2.events]);

  it('victim (p2 / Priya) sees "took your whole Tamil Nadu set"', () => {
    const clientState = project(step2.state, 'p2');
    const moment = momentOf('deal_breaker', entries, step2.state, 'p2');
    const copy = calloutCopyFor(moment, clientState, formatMoney);
    expect(copy.headline).toBe('DEAL BREAKER!');
    expect(copy.detail).toBe('Aarav took your whole Tamil Nadu set');
    expect(copy.tone).toBe('danger');
  });

  it("actor (p1 / Aarav) sees \"took Priya's whole Tamil Nadu set\"", () => {
    const clientState = project(step2.state, 'p1');
    const moment = momentOf('deal_breaker', entries, step2.state, 'p1');
    const copy = calloutCopyFor(moment, clientState, formatMoney);
    expect(copy.detail).toBe("You took Priya's whole Tamil Nadu set");
    expect(copy.tone).toBe('success');
  });
});

describe('calloutCopyFor — debt_collector', () => {
  const start = fixtures.debtCollectorChoice();
  const step1 = mustDispatch(start, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'dc1', zone: 'discard' });
  const step2 = mustDispatch(step1.state, {
    type: 'SELECT_DEBT_COLLECTOR_PLAYER',
    playerId: 'p1',
    targetPlayerId: 'p2',
  });
  const entries = toEntries([...step1.events, ...step2.events]);

  it('victim (p2 / Priya) sees "demands ₹5Cr from you"', () => {
    const clientState = project(step2.state, 'p2');
    const moment = momentOf('debt_collector', entries, step2.state, 'p2');
    const copy = calloutCopyFor(moment, clientState, formatMoney);
    expect(copy.headline).toBe('DEBT COLLECTOR!');
    expect(copy.detail).toBe('Aarav demands ₹5Cr from you');
    expect(copy.tone).toBe('danger');
  });
});

describe('calloutCopyFor — birthday coalescing', () => {
  const start = fixtures.parallelBirthdayCollection();
  const step1 = mustDispatch(start, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'bd1', zone: 'discard' });
  const entries = toEntries(step1.events);

  it('actor (p1) sees the "Everyone owes you" wording regardless of which payer moment is shown', () => {
    const clientState = project(step1.state, 'p1');
    const moment = momentOf('birthday', entries, step1.state, 'p1');
    const copy = calloutCopyFor(moment, clientState, formatMoney);
    expect(copy.headline).toBe("IT'S MY BIRTHDAY!");
    expect(copy.detail).toBe('Everyone owes you ₹2Cr');
    expect(copy.tone).toBe('success');
  });

  it('a payer (p2 / Priya) sees the individually-addressed wording', () => {
    const clientState = project(step1.state, 'p2');
    const moments = deriveMoments(entries, clientState, { now: 1000, viewerId: 'p2', mode: 'local' });
    const mine = moments.find((m) => m.kind === 'birthday' && m.targetIds.includes('p2'));
    expect(mine).toBeDefined();
    const copy = calloutCopyFor(mine!, clientState, formatMoney);
    expect(copy.detail).toBe('Aarav wants ₹2Cr from you');
    expect(copy.tone).toBe('danger');
  });
});

describe('calloutCopyFor — just_say_no', () => {
  const start = fixtures.doubleJustSayNoChain();
  const step1 = mustDispatch(start, { type: 'RESPOND_JUST_SAY_NO', playerId: 'p2', cardId: 'jsn_b' });
  const entries = toEntries(step1.events);

  it('the denied original actor (p1 / Aarav) sees danger tone', () => {
    const clientState = project(step1.state, 'p1');
    const moment = momentOf('just_say_no', entries, step1.state, 'p1');
    const copy = calloutCopyFor(moment, clientState, formatMoney);
    expect(copy.headline).toBe('JUST SAY NO!');
    expect(copy.detail).toBe('Priya says NO to your Debt Collector');
    expect(copy.tone).toBe('danger');
  });

  it('the blocker (p2 / Priya) sees success tone, "You say NO"', () => {
    const clientState = project(step1.state, 'p2');
    const moment = momentOf('just_say_no', entries, step1.state, 'p2');
    const copy = calloutCopyFor(moment, clientState, formatMoney);
    expect(copy.detail).toBe("You say NO to Aarav's Debt Collector");
    expect(copy.tone).toBe('success');
  });

  it('a spectator (p3 / Marcus) sees neutral tone, third-person', () => {
    const clientState = project(step1.state, 'p3');
    const moment = momentOf('just_say_no', entries, step1.state, 'p3');
    const copy = calloutCopyFor(moment, clientState, formatMoney);
    expect(copy.detail).toBe("Priya says NO to Aarav's Debt Collector");
    expect(copy.tone).toBe('neutral');
  });
});
