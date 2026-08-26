import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@monopoly-deal/shared';
import { dispatch } from './dispatch.js';
import { fixtures } from './fixtures.js';

function eventsOfType(events: GameEvent[], type: string): GameEvent[] {
  return events.filter((e) => e.type === type);
}

function dataOf(event: GameEvent | undefined): Record<string, unknown> {
  if (!event) throw new Error('Expected event not found');
  return (event.data ?? {}) as Record<string, unknown>;
}

describe('Engine event data contract', () => {
  it('sly_deal carries targetPlayerId, cardId and the color of the set the card was taken from', () => {
    let state = fixtures.responsiveMidGame();

    let result = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: 'sd1',
      zone: 'discard',
    });
    expect(result.rejected).toBeUndefined();
    state = result.state;

    // p3 (owner of u1) holds no Just Say No, so this resolves immediately.
    result = dispatch(state, {
      type: 'SELECT_STEAL_TARGET',
      playerId: 'p1',
      targetCardId: 'u1',
    });
    expect(result.rejected).toBeUndefined();

    const event = result.events.find((e) => e.type === 'sly_deal');
    expect(dataOf(event)).toEqual({
      targetPlayerId: 'p3',
      cardId: 'u1',
      color: 'utility',
    });
  });

  it('deal_breaker carries the whole set, including house/hotel, that moved', () => {
    let state = fixtures.dealBreakerOnSetWithHotel();

    let result = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: 'dbk1',
      zone: 'discard',
    });
    expect(result.rejected).toBeUndefined();
    state = result.state;

    result = dispatch(state, {
      type: 'SELECT_STEAL_TARGET',
      playerId: 'p1',
      targetSetId: 'set_yellow_full',
    });
    expect(result.rejected).toBeUndefined();

    const event = result.events.find((e) => e.type === 'deal_breaker');
    const data = dataOf(event);
    expect(data.targetPlayerId).toBe('p2');
    expect(data.setId).toBe('set_yellow_full');
    expect(data.color).toBe('yellow');
    expect(new Set(data.cardIds as string[])).toEqual(
      new Set(['y1', 'y2', 'y3', 'h1', 'ht1']),
    );
  });

  it('debt_collector and the resulting payment_made carry payer/payee/reason', () => {
    let state = fixtures.debtCollectorChoice();

    let result = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: 'dc1',
      zone: 'discard',
    });
    expect(result.rejected).toBeUndefined();
    state = result.state;

    result = dispatch(state, {
      type: 'SELECT_DEBT_COLLECTOR_PLAYER',
      playerId: 'p1',
      targetPlayerId: 'p3',
    });
    expect(result.rejected).toBeUndefined();
    state = result.state;

    const debtEvent = result.events.find((e) => e.type === 'debt_collector');
    expect(dataOf(debtEvent)).toEqual({ payerId: 'p3', amount: 5 });

    // p3's bank only holds ₹2Cr — paying everything is a legal (short) payment.
    result = dispatch(state, {
      type: 'SELECT_PAYMENT',
      playerId: 'p3',
      cardIds: ['p3b'],
    });
    expect(result.rejected).toBeUndefined();

    const paymentEvent = result.events.find((e) => e.type === 'payment_made');
    expect(dataOf(paymentEvent)).toEqual({
      cardIds: ['p3b'],
      total: 2,
      owed: 5,
      payeeId: 'p1',
      reason: 'debt_collector',
    });
  });

  it('birthday fires one event per payer when nobody can Just Say No', () => {
    const state = fixtures.parallelBirthdayCollection();

    const result = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: 'bd1',
      zone: 'discard',
    });
    expect(result.rejected).toBeUndefined();

    // None of p2/p3/p4 hold a Just Say No in this fixture, so all three
    // obligations resolve immediately instead of waiting behind a JSN window.
    const birthdayEvents = eventsOfType(result.events, 'birthday');
    expect(birthdayEvents).toHaveLength(3);
    const byPayer = new Map(birthdayEvents.map((e) => [dataOf(e).payerId as string, dataOf(e)]));
    expect(byPayer.get('p2')).toEqual({ payerId: 'p2', amount: 2 });
    expect(byPayer.get('p3')).toEqual({ payerId: 'p3', amount: 2 });
    expect(byPayer.get('p4')).toEqual({ payerId: 'p4', amount: 2 });
  });

  it('just_say_no carries the chain/contested info, and action_cancelled carries the decider', () => {
    let state = fixtures.doubleJustSayNoChain();

    let result = dispatch(state, {
      type: 'RESPOND_JUST_SAY_NO',
      playerId: 'p2',
      cardId: 'jsn_b',
    });
    expect(result.rejected).toBeUndefined();
    state = result.state;

    const jsnEvent = result.events.find((e) => e.type === 'just_say_no');
    expect(dataOf(jsnEvent)).toEqual({
      chain: 1,
      contestedType: 'debt_collector',
      contestedActorId: 'p1',
      contestedTargetId: 'p2',
    });

    // p1 could counter with jsn_a, but a second Just Say No would even out the
    // chain (proceeds, not cancelled) — declining instead stops the chain at
    // an odd count, which is what actually cancels the debt collector and
    // lets us assert `by`.
    result = dispatch(state, {
      type: 'DECLINE_JUST_SAY_NO',
      playerId: 'p1',
    });
    expect(result.rejected).toBeUndefined();

    const cancelEvent = result.events.find((e) => e.type === 'action_cancelled');
    const data = dataOf(cancelEvent);
    expect(data.by).toBe('p2');
    expect((data.contested as { type: string }).type).toBe('debt_collector');
  });

  it('set_broken from a payment carries the color and the payment reason', () => {
    const state = fixtures.payBreaksCompletedSet();

    const result = dispatch(state, {
      type: 'SELECT_PAYMENT',
      playerId: 'p2',
      cardIds: ['tiny', 'gg1'],
    });
    expect(result.rejected).toBeUndefined();

    const brokenEvent = result.events.find((e) => e.type === 'set_broken');
    expect(dataOf(brokenEvent)).toEqual({ color: 'green', reason: 'payment' });
  });

  it('rent_charged carries the payer, a numeric amount and the color', () => {
    const state = fixtures.doubleRentCombo();

    const result = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: 'r1',
      zone: 'discard',
    });
    expect(result.rejected).toBeUndefined();

    // p2 holds a Just Say No so their obligation is deferred; p3/p4 fire immediately.
    const rentEvents = eventsOfType(result.events, 'rent_charged');
    const forP3 = rentEvents.find((e) => dataOf(e).payerId === 'p3');
    const data = dataOf(forP3);
    expect(data.payerId).toBe('p3');
    expect(typeof data.amount).toBe('number');
    expect(data.color).toBe('red');
  });
});
