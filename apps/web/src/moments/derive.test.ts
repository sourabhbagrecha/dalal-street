import { describe, expect, it } from 'vitest';
import { dispatch, fixtures, project } from '@monopoly-deal/engine';
import type { GameEvent, GameState } from '@monopoly-deal/shared';
import type { LogEntry } from '../store/types';
import { deriveMoments } from './derive';

function toEntries(events: GameEvent[]): LogEntry[] {
  return events.map((e, i) => ({ ...e, id: i + 1, at: '' }));
}

function mustDispatch(state: GameState, command: Parameters<typeof dispatch>[1]): { state: GameState; events: GameEvent[] } {
  const result = dispatch(state, command);
  if (result.rejected) throw new Error(`dispatch rejected: ${result.rejected}`);
  return { state: result.state, events: result.events };
}

describe('deriveMoments — sly_deal', () => {
  const start = fixtures.responsiveMidGame();
  const step1 = mustDispatch(start, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'sd1', zone: 'discard' });
  const step2 = mustDispatch(step1.state, {
    type: 'SELECT_STEAL_TARGET',
    playerId: 'p1',
    targetCardId: 'u1',
  });
  const entries = toEntries([...step1.events, ...step2.events]);

  it.each(['p1', 'p3', 'p2'] as const)('resolves actor/target/cards/color for viewer %s', (viewerId) => {
    const clientState = project(step2.state, viewerId);
    const moments = deriveMoments(entries, clientState, { now: 1000, viewerId, mode: 'local' });
    const slyDeals = moments.filter((m) => m.kind === 'sly_deal');
    expect(slyDeals).toHaveLength(1);
    const moment = slyDeals[0]!;
    expect(moment.actorId).toBe('p1');
    expect(moment.targetIds).toEqual(['p3']);
    expect(moment.cards.map((c) => c.id)).toEqual(['u1']);
    expect(moment.color).toBe('utility');
    expect(moment.faceCard).toEqual({ id: 'moment-face-sly_deal', kind: 'action', action: 'sly_deal', value: 3 });
  });
});

describe('deriveMoments — deal_breaker', () => {
  const start = fixtures.dealBreakerOnSetWithHotel();
  const step1 = mustDispatch(start, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'dbk1', zone: 'discard' });
  const step2 = mustDispatch(step1.state, {
    type: 'SELECT_STEAL_TARGET',
    playerId: 'p1',
    targetSetId: 'set_yellow_full',
  });
  const entries = toEntries([...step1.events, ...step2.events]);

  it('resolves the whole set (house + hotel included) via the color fallback', () => {
    const clientState = project(step2.state, 'p1');
    const moments = deriveMoments(entries, clientState, { now: 1000, viewerId: 'p1', mode: 'local' });
    const dealBreakers = moments.filter((m) => m.kind === 'deal_breaker');
    expect(dealBreakers).toHaveLength(1);
    const moment = dealBreakers[0]!;
    expect(moment.actorId).toBe('p1');
    expect(moment.targetIds).toEqual(['p2']);
    expect(moment.color).toBe('yellow');
    expect(new Set(moment.cards.map((c) => c.id))).toEqual(new Set(['y1', 'y2', 'y3', 'h1', 'ht1']));
  });
});

describe('deriveMoments — debt_collector', () => {
  const start = fixtures.debtCollectorChoice();
  const step1 = mustDispatch(start, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'dc1', zone: 'discard' });
  const step2 = mustDispatch(step1.state, {
    type: 'SELECT_DEBT_COLLECTOR_PLAYER',
    playerId: 'p1',
    targetPlayerId: 'p2',
  });
  const entries = toEntries([...step1.events, ...step2.events]);

  it('resolves actor/target/amount from the message fallback', () => {
    const clientState = project(step2.state, 'p1');
    const moments = deriveMoments(entries, clientState, { now: 1000, viewerId: 'p1', mode: 'local' });
    const debtCollectors = moments.filter((m) => m.kind === 'debt_collector');
    expect(debtCollectors).toHaveLength(1);
    expect(debtCollectors[0]!.actorId).toBe('p1');
    expect(debtCollectors[0]!.targetIds).toEqual(['p2']);
    expect(debtCollectors[0]!.amount).toBe(5);
  });
});

describe('deriveMoments — birthday coalescing source events', () => {
  const start = fixtures.parallelBirthdayCollection();
  const step1 = mustDispatch(start, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'bd1', zone: 'discard' });
  const entries = toEntries(step1.events);

  it('produces one birthday moment per payer in a single batch', () => {
    const clientState = project(step1.state, 'p1');
    const moments = deriveMoments(entries, clientState, { now: 1000, viewerId: 'p1', mode: 'local' });
    const birthdays = moments.filter((m) => m.kind === 'birthday');
    expect(birthdays).toHaveLength(3);
    expect(birthdays.map((m) => m.targetIds[0]).sort()).toEqual(['p2', 'p3', 'p4']);
    for (const m of birthdays) {
      expect(m.actorId).toBe('p1');
      expect(m.amount).toBe(2);
    }
  });
});

describe('deriveMoments — just_say_no (pendingStack fallback)', () => {
  const start = fixtures.doubleJustSayNoChain();
  const step1 = mustDispatch(start, { type: 'RESPOND_JUST_SAY_NO', playerId: 'p2', cardId: 'jsn_b' });
  const entries = toEntries(step1.events);

  it('resolves the contested actor/type from the still-pending JSN when data is missing', () => {
    const clientState = project(step1.state, 'p2');
    const moments = deriveMoments(entries, clientState, { now: 1000, viewerId: 'p2', mode: 'local' });
    const jsns = moments.filter((m) => m.kind === 'just_say_no');
    expect(jsns).toHaveLength(1);
    const moment = jsns[0]!;
    expect(moment.actorId).toBe('p2');
    expect(moment.targetIds).toEqual(['p1']);
    expect(moment.contestedType).toBe('debt_collector');
    expect(moment.chain).toBe(1);
  });
});
