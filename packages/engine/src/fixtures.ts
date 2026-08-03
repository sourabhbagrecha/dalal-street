import type {
  ActionCard,
  Card,
  GameState,
  PlayerState,
  PropertyCard,
  PropertyColor,
  PropertySet,
  RentCard,
} from '@monopoly-deal/shared';
import { MAX_PLAYS } from '@monopoly-deal/shared';
import { resetSetIdSequence } from './board.js';
import { buildDeck } from './deck.js';

function money(id: string, amount: number): Card {
  return { id, kind: 'money', amount, value: amount };
}
function prop(id: string, color: PropertyColor, value: number): PropertyCard {
  return { id, kind: 'property', color, value };
}
function action(id: string, a: ActionCard['action'], value: number): ActionCard {
  return { id, kind: 'action', action: a, value };
}
function rent(id: string, colors: PropertyColor[], rentType: 'dual' | 'wild' = 'dual'): RentCard {
  return {
    id,
    kind: 'rent',
    rentType,
    colors,
    value: rentType === 'wild' ? 3 : 1,
  };
}

function player(id: string, hand: Card[] = [], bank: Card[] = [], sets: PropertySet[] = []): PlayerState {
  return { id, hand, board: { bank, sets } };
}

function baseState(players: PlayerState[], overrides: Partial<GameState> = {}): GameState {
  resetSetIdSequence();
  const deck = buildDeck();
  const used = new Set<string>();
  const collect = (cards: Card[]) => cards.forEach((c) => used.add(c.id));
  for (const p of players) {
    collect(p.hand);
    collect(p.board.bank);
    for (const s of p.board.sets) {
      collect(s.cards);
      if (s.house) used.add(s.house.id);
      if (s.hotel) used.add(s.hotel.id);
    }
  }
  const remaining = deck.filter((c) => !used.has(c.id) && c.kind !== 'rule');
  const outOfPlay = deck.filter((c) => c.kind === 'rule');
  return {
    players,
    deck: remaining,
    discard: [],
    outOfPlay,
    currentPlayerIndex: 0,
    playsRemaining: MAX_PLAYS,
    turnPhase: 'playing',
    pendingStack: [],
    pendingDoubles: 0,
    winnerId: null,
    seed: 42,
    turnNumber: 5,
    drawnThisTurn: true,
    ...overrides,
  };
}

export const fixtures = {
  standardMidGame(): GameState {
    return baseState([
      player(
        'p1',
        [money('m1', 2), action('pg1', 'pass_go', 1), prop('pr1', 'red', 3), rent('r1', ['red', 'yellow'])],
        [money('mb1', 5), money('mb2', 1)],
        [
          {
            id: 'set_orange',
            color: 'orange',
            cards: [prop('o1', 'orange', 2), prop('o2', 'orange', 2)],
          },
          {
            id: 'set_lb',
            color: 'light_blue',
            cards: [prop('lb1', 'light_blue', 1), prop('lb2', 'light_blue', 1), prop('lb3', 'light_blue', 1)],
          },
        ],
      ),
      player(
        'p2',
        [action('jsn1', 'just_say_no', 4), money('m2', 1)],
        [money('mb3', 3)],
        [
          {
            id: 'set_brown',
            color: 'brown',
            cards: [prop('br1', 'brown', 1)],
          },
        ],
      ),
      player('p3', [prop('g1', 'green', 4)], [money('mb4', 2)], []),
      player('p4', [action('sd1', 'sly_deal', 3)], [], []),
    ]);
  },

  oneSetFromWinning(): GameState {
    return baseState([
      player(
        'p1',
        [prop('db2', 'dark_blue', 4)],
        [money('w1', 10)],
        [
          {
            id: 'set_db',
            color: 'dark_blue',
            cards: [prop('db1', 'dark_blue', 4)],
          },
          {
            id: 'set_brown_w',
            color: 'brown',
            cards: [prop('bw1', 'brown', 1), prop('bw2', 'brown', 1)],
          },
          {
            id: 'set_util',
            color: 'utility',
            cards: [prop('u1', 'utility', 2), prop('u2', 'utility', 2)],
          },
        ],
      ),
      player('p2', [money('x1', 1)], [], []),
      player('p3', [], [], []),
      player('p4', [], [], []),
    ]);
  },

  emptyHand(): GameState {
    return baseState(
      [
        player('p1', [], [money('e1', 2)], []),
        player('p2', [money('e2', 1)], [], []),
        player('p3', [], [], []),
        player('p4', [], [], []),
      ],
      { turnPhase: 'awaiting_draw', drawnThisTurn: false, playsRemaining: 3 },
    );
  },

  overHandLimit(): GameState {
    const hand: Card[] = [];
    for (let i = 0; i < 9; i++) hand.push(money(`oh${i}`, 1));
    return baseState(
      [
        player('p1', hand, [], []),
        player('p2', [], [], []),
        player('p3', [], [], []),
        player('p4', [], [], []),
      ],
      {
        turnPhase: 'awaiting_discard',
        pendingStack: [{ kind: 'hand_limit_discard', playerId: 'p1', excess: 2 }],
      },
    );
  },

  rentWithEmptyBank(): GameState {
    return baseState(
      [
        player(
          'p1',
          [],
          [],
          [
            {
              id: 'set_red_full',
              color: 'red',
              cards: [prop('rr1', 'red', 3), prop('rr2', 'red', 3), prop('rr3', 'red', 3)],
            },
          ],
        ),
        player(
          'p2',
          [],
          [],
          [
            {
              id: 'set_pink_part',
              color: 'pink',
              cards: [prop('pk1', 'pink', 2), prop('pk2', 'pink', 2)],
            },
          ],
        ),
        player('p3', [], [money('rb1', 5)], []),
        player('p4', [], [], []),
      ],
      {
        pendingStack: [
          {
            kind: 'payment',
            payerId: 'p2',
            payeeId: 'p1',
            amountDue: 6,
            reason: 'rent',
          },
        ],
      },
    );
  },

  dealBreakerOnSetWithHotel(): GameState {
    return baseState([
      player('p1', [action('dbk1', 'deal_breaker', 5)], [], []),
      player(
        'p2',
        [],
        [],
        [
          {
            id: 'set_yellow_full',
            color: 'yellow',
            cards: [prop('y1', 'yellow', 3), prop('y2', 'yellow', 3), prop('y3', 'yellow', 3)],
            house: action('h1', 'house', 3),
            hotel: action('ht1', 'hotel', 4),
          },
        ],
      ),
      player('p3', [], [], []),
      player('p4', [], [], []),
    ]);
  },

  doubleJustSayNoChain(): GameState {
    return baseState(
      [
        player('p1', [action('jsn_a', 'just_say_no', 4)], [], []),
        player('p2', [action('jsn_b', 'just_say_no', 4)], [money('jsn_bank', 5)], []),
        player('p3', [action('jsn_c', 'just_say_no', 4)], [], []),
        player('p4', [], [], []),
      ],
      {
        pendingStack: [
          {
            kind: 'just_say_no',
            respondentId: 'p2',
            initiatorId: 'p1',
            jsnCount: 0,
            contestedAction: {
              type: 'debt_collector',
              actorId: 'p1',
              targetPlayerId: 'p2',
              payload: {},
            },
          },
        ],
      },
    );
  },

  payBreaksCompletedSet(): GameState {
    return baseState(
      [
        player('p1', [], [], []),
        player(
          'p2',
          [],
          [money('tiny', 1)],
          [
            {
              id: 'set_green_full',
              color: 'green',
              cards: [prop('gg1', 'green', 4), prop('gg2', 'green', 4), prop('gg3', 'green', 4)],
              house: action('gh1', 'house', 3),
            },
          ],
        ),
        player('p3', [], [], []),
        player('p4', [], [], []),
      ],
      {
        pendingStack: [
          {
            kind: 'payment',
            payerId: 'p2',
            payeeId: 'p1',
            amountDue: 5,
            reason: 'rent',
          },
        ],
        currentPlayerIndex: 0,
      },
    );
  },

  insufficientPayment(): GameState {
    return baseState(
      [
        player('p1', [], [], []),
        player('p2', [], [money('only1', 1)], []),
        player('p3', [], [], []),
        player('p4', [], [], []),
      ],
      {
        pendingStack: [
          {
            kind: 'payment',
            payerId: 'p2',
            payeeId: 'p1',
            amountDue: 5,
            reason: 'debt_collector',
          },
        ],
      },
    );
  },
};

export type FixtureName = keyof typeof fixtures;
