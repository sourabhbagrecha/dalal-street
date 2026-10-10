import { describe, expect, it } from 'vitest';
import type { Card } from '@monopoly-deal/shared';
import { claims } from './step';

const money = (id: string): Card => ({ id, kind: 'money', value: 1, amount: 1 });
const action = (id: string): Card => ({ id, kind: 'action', action: 'deal_breaker', value: 5 });
const prop = (id: string): Card => ({ id, kind: 'property', color: 'red', value: 3, name: id });

describe('claims: the cards a scene delivers onto the table', () => {
  it('names the cards each landing scene puts down', () => {
    expect(claims({ kind: 'deal', to: 'me', cards: [prop('a'), money('b')] })).toEqual(['a', 'b']);
    expect(claims({ kind: 'lay', by: 'x', card: prop('c'), into: 'set', setId: 's' })).toEqual(['c']);
    expect(claims({ kind: 'loot', by: 'x', from: 'y', card: prop('d'), setId: 's', played: action('p'), label: '' })).toEqual(['d']);
    expect(claims({ kind: 'toss', by: 'x', card: money('e') })).toEqual(['e']);
  });

  it('claims nothing for money into a bank pile or a levy', () => {
    expect(claims({ kind: 'lay', by: 'x', card: money('m'), into: 'bank' })).toEqual([]);
    expect(claims({ kind: 'levy', by: 'x', played: action('p'), label: '', takes: [{ from: 'y', owed: 2, cards: [money('m')] }] })).toEqual([]);
    expect(claims({ kind: 'reset' })).toEqual([]);
  });

  it('claims a raided set and the properties (not the notes) of folded payments', () => {
    const set = { id: 's', color: 'red', cards: [prop('r1'), prop('r2')] } as never;
    expect(claims({ kind: 'raid', by: 'x', from: 'y', set, played: action('p'), label: '' })).toEqual(['r1', 'r2']);
    expect(
      claims({ kind: 'pay', by: 'a', to: 'z', cards: [money('m1'), prop('p1')], label: '', also: [{ by: 'b', cards: [prop('p2'), money('m2')], label: '' }] }),
    ).toEqual(['p1', 'p2']);
  });
});
