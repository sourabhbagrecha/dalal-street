import { describe, expect, it } from 'vitest';
import type { ContestedAction, PendingInteraction } from '@monopoly-deal/shared';
import { actingPlayerForPending } from './dispatch.js';
import { fixtures } from './fixtures.js';

const contested: ContestedAction = {
  type: 'debt_collector',
  actorId: 'p1',
  targetPlayerId: 'p2',
  payload: {},
};

function topOf(state: { pendingStack: PendingInteraction[] }): PendingInteraction {
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (!top) throw new Error('fixture has no pending interaction');
  return top;
}

describe('actingPlayerForPending', () => {
  it('payment: the payer acts', () => {
    expect(actingPlayerForPending(topOf(fixtures.rentWithEmptyBank()))).toBe('p2');
  });

  it('payment_round: an open Just Say No respondent acts before any payer', () => {
    const top: PendingInteraction = {
      kind: 'payment_round',
      payeeId: 'p1',
      reason: 'its_my_birthday',
      entries: [
        { payerId: 'p2', amountDue: 2, phase: 'payment' },
        {
          payerId: 'p3',
          amountDue: 2,
          phase: 'jsn',
          jsn: { respondentId: 'p3', initiatorId: 'p1', contestedAction: contested, jsnCount: 0 },
        },
      ],
    };
    expect(actingPlayerForPending(top)).toBe('p3');
  });

  it('payment_round: with no JSN open, the first unpaid payer acts', () => {
    const top: PendingInteraction = {
      kind: 'payment_round',
      payeeId: 'p1',
      reason: 'rent',
      entries: [
        { payerId: 'p2', amountDue: 2, phase: 'done' },
        { payerId: 'p3', amountDue: 2, phase: 'payment' },
      ],
    };
    expect(actingPlayerForPending(top)).toBe('p3');
  });

  it('payment_round: nobody acts once every entry is settled', () => {
    const top: PendingInteraction = {
      kind: 'payment_round',
      payeeId: 'p1',
      reason: 'rent',
      entries: [
        { payerId: 'p2', amountDue: 2, phase: 'done' },
        { payerId: 'p3', amountDue: 2, phase: 'skipped' },
      ],
    };
    expect(actingPlayerForPending(top)).toBeNull();
  });

  it('just_say_no: the respondent acts', () => {
    expect(actingPlayerForPending(topOf(fixtures.doubleJustSayNoChain()))).toBe('p2');
  });

  it('hand_limit_discard: the over-limit player acts', () => {
    expect(actingPlayerForPending(topOf(fixtures.overHandLimit()))).toBe('p1');
  });

  it('sly_deal_target: the actor acts', () => {
    expect(
      actingPlayerForPending({ kind: 'sly_deal_target', actorId: 'p1', cardId: 'c1' }),
    ).toBe('p1');
  });

  it('forced_deal_target: the actor acts', () => {
    expect(
      actingPlayerForPending({ kind: 'forced_deal_target', actorId: 'p2', cardId: 'c1' }),
    ).toBe('p2');
  });

  it('deal_breaker_target: the actor acts', () => {
    expect(
      actingPlayerForPending({ kind: 'deal_breaker_target', actorId: 'p3', cardId: 'c1' }),
    ).toBe('p3');
  });

  it('debt_collector_target: the actor acts', () => {
    expect(
      actingPlayerForPending({ kind: 'debt_collector_target', actorId: 'p1', cardId: 'c1' }),
    ).toBe('p1');
  });

  it('rent_color_choice: the actor acts', () => {
    expect(
      actingPlayerForPending({
        kind: 'rent_color_choice',
        actorId: 'p2',
        cardId: 'c1',
        eligibleColors: ['red'],
        doubleCount: 0,
        rentType: 'dual',
      }),
    ).toBe('p2');
  });

  it('rent_player_choice: the actor acts', () => {
    expect(
      actingPlayerForPending({
        kind: 'rent_player_choice',
        actorId: 'p3',
        cardId: 'c1',
        color: 'red',
        doubleCount: 0,
        amount: 3,
      }),
    ).toBe('p3');
  });

  it('house_hotel_target: the actor acts', () => {
    expect(
      actingPlayerForPending({
        kind: 'house_hotel_target',
        actorId: 'p1',
        cardId: 'c1',
        building: 'house',
      }),
    ).toBe('p1');
  });

  it('double_rent_pending: the actor acts', () => {
    expect(
      actingPlayerForPending({ kind: 'double_rent_pending', actorId: 'p2', doubleCardIds: ['d1'] }),
    ).toBe('p2');
  });
});
