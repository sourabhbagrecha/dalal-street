import { describe, expect, it } from 'vitest';
import type { Card, GameState, PlayerState, PropertyCard, PropertySet } from '@monopoly-deal/shared';
import { computeAutoPayment, _sumSelected } from './autoPayment.js';
import { resetSetIdSequence } from './board.js';

function money(id: string, amount: number): Card {
  return { id, kind: 'money', amount, value: amount };
}

function prop(id: string, color: PropertyCard['color'], value: number): PropertyCard {
  return { id, kind: 'property', color, value, name: id };
}

function multiWild(id: string): Card {
  return { id, kind: 'property_wild', colors: [], value: 0 };
}

function player(
  id: string,
  bank: Card[] = [],
  sets: PropertySet[] = [],
): PlayerState {
  return { id, hand: [], board: { bank, sets }, connected: true };
}

function stateOf(payers: PlayerState[], amountDue: number): GameState {
  resetSetIdSequence();
  return {
    players: payers,
    deck: [],
    discard: [],
    outOfPlay: [],
    currentPlayerIndex: 0,
    playsRemaining: 3,
    turnPhase: 'playing',
    pendingStack: [
      {
        kind: 'payment',
        payerId: 'p2',
        payeeId: 'p1',
        amountDue,
        reason: 'rent',
      },
    ],
    pendingDoubles: 0,
    winnerId: null,
    seed: 1,
    turnNumber: 1,
    drawnThisTurn: true,
  };
}

describe('computeAutoPayment', () => {
  it('pays with bank only when bank is sufficient (cheapest)', () => {
    const s = stateOf(
      [
        player('p1'),
        player('p2', [money('b5', 5), money('b2', 2), money('b1', 1)], [
          {
            id: 'set_orange',
            color: 'orange',
            cards: [prop('o1', 'orange', 2), prop('o2', 'orange', 2)],
          },
        ]),
      ],
      3,
    );
    const ids = computeAutoPayment(s, 'p2', 3);
    expect(ids.sort()).toEqual(['b1', 'b2']);
    expect(_sumSelected(s, 'p2', ids)).toBe(3);
    expect(ids.includes('o1')).toBe(false);
  });

  it('breaks a completed set only when unavoidable', () => {
    const s = stateOf(
      [
        player('p1'),
        player('p2', [money('tiny', 1)], [
          {
            id: 'set_green_full',
            color: 'green',
            cards: [
              prop('gg1', 'green', 4),
              prop('gg2', 'green', 4),
              prop('gg3', 'green', 4),
            ],
          },
        ]),
      ],
      5,
    );
    const ids = computeAutoPayment(s, 'p2', 5);
    expect(ids).toContain('tiny');
    // Need 4 more from the completed green set
    expect(ids.some((id) => id.startsWith('gg'))).toBe(true);
    expect(_sumSelected(s, 'p2', ids)).toBeGreaterThanOrEqual(5);
  });

  it('pays everything when total assets are insufficient', () => {
    const s = stateOf(
      [player('p1'), player('p2', [money('only1', 1)], [])],
      5,
    );
    const ids = computeAutoPayment(s, 'p2', 5);
    expect(ids).toEqual(['only1']);
  });

  it('never includes multicolor wilds', () => {
    const wild = multiWild('mw1');
    const s = stateOf(
      [
        player('p1'),
        player('p2', [money('m2', 2), wild], [
          {
            id: 'set_brown',
            color: 'brown',
            cards: [prop('br1', 'brown', 1), wild],
          },
        ]),
      ],
      2,
    );
    // Place wild only in bank for a clean case
    s.players[1]!.board = {
      bank: [money('m2', 2), wild],
      sets: [
        {
          id: 'set_brown',
          color: 'brown',
          cards: [prop('br1', 'brown', 1)],
        },
      ],
    };
    const ids = computeAutoPayment(s, 'p2', 2);
    expect(ids).toEqual(['m2']);
    expect(ids).not.toContain('mw1');

    // Insufficient without wild: owe 10, only $2 bank + $1 prop; wild ignored
    const ids2 = computeAutoPayment(s, 'p2', 10);
    expect(ids2).not.toContain('mw1');
    expect(ids2.sort()).toEqual(['br1', 'm2']);
  });
});
