import type { Card, PropertySet } from '@monopoly-deal/shared';
import { PROPERTY_SET_DEFS } from '@monopoly-deal/shared';

/**
 * Mock opponents for the /scratchpad layout candidates. Shaped like
 * ClientPlayerPublic plus the few presentation facts the candidates need
 * (a seat colour, whose turn it is). Deliberately covers the spread a real
 * table produces: an empty board, a complete set with a building, a heavy
 * four-set board, and a disconnected seat.
 */
export interface MockOpponent {
  id: string;
  name: string;
  color: string;
  handCount: number;
  connected: boolean;
  bank: Card[];
  sets: PropertySet[];
}

function money(id: string, amount: number): Card {
  return { id, kind: 'money', amount, value: amount };
}

function prop(id: string, color: keyof typeof PROPERTY_SET_DEFS, idx: number): Card {
  const def = PROPERTY_SET_DEFS[color];
  return { id, kind: 'property', color, value: def.value, name: def.names[idx] ?? def.names[0]! };
}

function set(id: string, color: keyof typeof PROPERTY_SET_DEFS, count: number, extra?: Partial<PropertySet>): PropertySet {
  return {
    id,
    color,
    cards: Array.from({ length: count }, (_, i) => prop(`${id}-c${i}`, color, i)),
    ...extra,
  };
}

export const MOCK_OPPONENTS: MockOpponent[] = [
  {
    id: 'priya',
    name: 'Priya',
    color: '#c4552f',
    handCount: 5,
    connected: true,
    bank: [money('pb1', 3), money('pb2', 1), money('pb3', 4)],
    sets: [set('p-rail', 'railroad', 2), set('p-orange', 'orange', 1)],
  },
  {
    id: 'marcus',
    name: 'Marcus',
    color: '#2c4a75',
    handCount: 5,
    connected: true,
    bank: [money('mb1', 5), money('mb2', 2)],
    sets: [
      set('m-blue', 'dark_blue', 2, { house: { id: 'm-house', kind: 'action', action: 'house', value: 3 } }),
      set('m-brown', 'brown', 1),
    ],
  },
  {
    id: 'yuki',
    name: 'Yuki',
    color: '#2f7d4a',
    handCount: 3,
    connected: false,
    bank: [money('yb1', 1), money('yb2', 1)],
    sets: [],
  },
  {
    id: 'alex',
    name: 'Alex',
    color: '#3b1673',
    handCount: 7,
    connected: true,
    bank: [money('ab1', 10), money('ab2', 2), money('ab3', 3), money('ab4', 1), money('ab5', 5)],
    sets: [
      set('a-green', 'green', 3, { hotel: { id: 'a-hotel', kind: 'action', action: 'hotel', value: 4 } }),
      set('a-pink', 'pink', 2),
      set('a-util', 'utility', 1),
      set('a-lblue', 'light_blue', 2),
    ],
  },
];

/** Whose turn it is in every candidate — the first seat, like the screenshot. */
export const MOCK_TURN_ID = 'priya';
export const MOCK_PLAYS_REMAINING = 2;
export const MOCK_TIMER_PCT = 0.62;
export const MOCK_TIMER_TEXT = '0:37';

export function bankTotal(p: MockOpponent): number {
  return p.bank.reduce((sum, c) => sum + c.value, 0);
}
