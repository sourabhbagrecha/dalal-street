import { describe, expect, it } from 'vitest';
import type { Card, PropertyColor } from '@monopoly-deal/shared';
import { sortHand } from './handSort';

const money = (id: string, amount: number): Card => ({ id, kind: 'money', amount, value: amount });
const prop = (id: string, color: PropertyColor, value = 1): Card => ({ id, kind: 'property', color, value, name: id });
const wild = (id: string, colors: PropertyColor[] = []): Card => ({ id, kind: 'property_wild', colors, value: colors.length ? 4 : 0 });
const action = (id: string): Card => ({ id, kind: 'action', action: 'pass_go', value: 1 });
const rent = (id: string): Card => ({ id, kind: 'rent', rentType: 'wild', colors: [], value: 3 });

describe('sortHand', () => {
  it('"dealt" returns a copy in the original order, untouched', () => {
    const hand = [action('a1'), money('m1', 4), prop('p1', 'red')];
    const out = sortHand(hand, 'dealt');
    expect(out).toEqual(hand);
    expect(out).not.toBe(hand);
  });

  it('"grouped" clusters money (highest first), then properties by colour, then wilds, rent, actions', () => {
    const hand = [action('act1'), prop('py', 'yellow'), money('m1', 1), wild('w1'), rent('r1'), money('m2', 4), prop('pr', 'red')];
    const out = sortHand(hand, 'grouped').map((c) => c.id);
    expect(out).toEqual(['m2', 'm1', 'pr', 'py', 'w1', 'r1', 'act1']);
  });

  it('keeps a stable order within a tied group (does not reshuffle cards of the same kind/colour)', () => {
    const hand = [action('first'), action('second'), action('third')];
    expect(sortHand(hand, 'grouped').map((c) => c.id)).toEqual(['first', 'second', 'third']);
  });

  it('never drops or duplicates a card', () => {
    const hand = [money('m1', 2), prop('p1', 'green'), wild('w1'), action('a1'), rent('r1')];
    const out = sortHand(hand, 'grouped');
    expect(out).toHaveLength(hand.length);
    expect(new Set(out.map((c) => c.id))).toEqual(new Set(hand.map((c) => c.id)));
  });
});
