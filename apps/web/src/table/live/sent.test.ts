import { describe, expect, it } from 'vitest';
import type { Card } from '@monopoly-deal/shared';
import { ACK_GRACE_MS, acked, begin, failed, handLess, mayChangePhase, nextExpiry, spentPlays, uiZone, waiting } from './sent';
import type { ClientGameState } from '@monopoly-deal/shared';

const money = (id: string, value = 1): Card => ({ id, kind: 'money', value, amount: value });
const stateWith = (hand: Card[]) => ({ you: { hand } }) as unknown as ClientGameState;

describe('sent plays', () => {
  it('maps the wire zone to the table zone', () => {
    expect([uiZone('bank'), uiZone('property'), uiZone('discard')]).toEqual(['bank', 'build', 'play']);
  });

  it('begin replaces an earlier entry for the same card', () => {
    const c = money('m1');
    const list = begin(begin([], c, 'bank', undefined), c, 'discard', undefined);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ zone: 'play', ackedAt: null });
  });

  it('waits while the server still holds the card, and lets go once it does not', () => {
    const c = money('m1');
    const list = begin([], c, 'bank', undefined);
    expect(waiting(list, stateWith([c]), 0)).toHaveLength(1);
    expect(waiting(list, stateWith([]), 0)).toHaveLength(0);
  });

  it('hands a card back when the server said yes but the projection never showed it', () => {
    const c = money('m1');
    const list = acked(begin([], c, 'bank', undefined), 'm1', 1000);
    expect(waiting(list, stateWith([c]), 1000 + ACK_GRACE_MS - 1)).toHaveLength(1);
    expect(waiting(list, stateWith([c]), 1000 + ACK_GRACE_MS)).toHaveLength(0);
  });

  it('never gives up on a card the server has not answered about (the outbox has its own limit)', () => {
    const c = money('m1');
    expect(waiting(begin([], c, 'bank', undefined), stateWith([c]), 1e12)).toHaveLength(1);
  });

  it('reports when the next acknowledged entry gives up', () => {
    const a = money('a');
    const b = money('b');
    let list = begin(begin([], a, 'bank', undefined), b, 'bank', undefined);
    expect(nextExpiry(list, 0)).toBeNull();
    list = acked(list, 'b', 500);
    expect(nextExpiry(list, 600)).toBe(ACK_GRACE_MS - 100);
  });

  it('a failure removes just that card', () => {
    const a = money('a');
    const b = money('b');
    const list = failed(begin(begin([], a, 'bank', undefined), b, 'bank', undefined), 'a');
    expect(list.map((o) => o.card.id)).toEqual(['b']);
  });

  it('shows the hand without what has been put down', () => {
    const a = money('a');
    const b = money('b');
    expect(handLess([a, b], [{ card: a }]).map((c) => c.id)).toEqual(['b']);
    const hand = [a, b];
    expect(handLess(hand, [])).toBe(hand);
  });

  it('only plays to the pile may change the phase', () => {
    const a = money('a');
    expect(mayChangePhase([{ card: a, zone: 'bank' }, { card: a, zone: 'build' }])).toBe(false);
    expect(mayChangePhase([{ card: a, zone: 'play' }])).toBe(true);
  });

  it('does not count a Double the Rent against the plays', () => {
    const dbl = { id: 'd1', kind: 'action', action: 'double_the_rent', value: 1 } as Card;
    expect(spentPlays([{ card: dbl }, { card: money('m1') }])).toBe(1);
  });
});
