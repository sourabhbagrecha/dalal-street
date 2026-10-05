import type {
  ActionCard,
  Card,
  GameState,
  PlayerState,
  PropertyCard,
  PropertyColor,
  PropertySet,
  PropertyWildCard,
  RentCard,
} from '@monopoly-deal/shared';
import { MAX_PLAYS, PROPERTY_SET_DEFS } from '@monopoly-deal/shared';
import { buildDeck } from './deck.js';

function money(id: string, amount: number): Card {
  return { id, kind: 'money', amount, value: amount };
}

/** Fixture helper — assigns the next catalog street name for the color. */
const propNameCursor: Partial<Record<PropertyColor, number>> = {};

function prop(id: string, color: PropertyColor, value: number, name?: string): PropertyCard {
  const names = PROPERTY_SET_DEFS[color].names;
  let resolved = name;
  if (!resolved) {
    const i = propNameCursor[color] ?? 0;
    resolved = names[i % names.length]!;
    propNameCursor[color] = i + 1;
  }
  return { id, kind: 'property', color, value, name: resolved };
}
function action(id: string, a: ActionCard['action'], value: number): ActionCard {
  return { id, kind: 'action', action: a, value };
}
function wild(id: string, colors: PropertyColor[], assignedColor?: PropertyColor): PropertyWildCard {
  return {
    id,
    kind: 'property_wild',
    colors,
    value: colors.length === 0 ? 0 : 4,
    ...(assignedColor ? { assignedColor } : {}),
  };
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
  for (const key of Object.keys(propNameCursor) as PropertyColor[]) {
    delete propNameCursor[key];
  }
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
    nextSetId: 1,
    ...overrides,
  };
}

export const fixtures = {
  /** Dev fixture for responsive/mobile layout review: dense hand, mixed set progress, 4 players. */
  responsiveMidGame(): GameState {
    return baseState(
      [
        player(
          'p1',
          [
            money('m1', 4),
            money('m2', 2),
            action('pg1', 'pass_go', 1),
            action('sd1', 'sly_deal', 3),
            prop('pr1', 'red', 3),
            prop('pr2', 'yellow', 3),
            rent('rt1', ['orange', 'green']),
          ],
          [money('mb1', 5), money('mb2', 3), money('mb3', 1)],
          [
            {
              id: 'set_orange',
              color: 'orange',
              cards: [prop('o1', 'orange', 2), prop('o2', 'orange', 2)],
            },
            {
              id: 'set_green',
              color: 'green',
              cards: [prop('gr1', 'green', 4)],
            },
          ],
        ),
        player(
          'p2',
          [action('jsn1', 'just_say_no', 4), money('m2b', 2), action('db1', 'debt_collector', 3)],
          [money('mb4', 4), money('mb5', 2)],
          [
            {
              id: 'set_pink',
              color: 'pink',
              cards: [prop('pk1', 'pink', 2), prop('pk2', 'pink', 2), prop('pk3', 'pink', 2)],
              house: action('h1', 'house', 3),
            },
            {
              id: 'set_lb',
              color: 'light_blue',
              cards: [prop('lb1', 'light_blue', 1), prop('lb2', 'light_blue', 1), prop('lb3', 'light_blue', 1)],
            },
          ],
        ),
        player(
          'p3',
          [
            prop('g1', 'railroad', 2),
            action('fd1', 'forced_deal', 3),
            money('m3', 1),
            money('m4', 3),
            rent('rt2', ['utility', 'railroad']),
          ],
          [money('mb6', 2)],
          [
            {
              id: 'set_util',
              color: 'utility',
              cards: [prop('u1', 'utility', 2)],
            },
          ],
        ),
        player('p4', [action('sd2', 'sly_deal', 3), money('m5', 1)], [money('mb7', 1)], []),
      ],
      { playsRemaining: 2 },
    );
  },
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
    ], {
      discard: [action('disc1', 'debt_collector', 3)],
    });
  },

  /** Dev fixture for the Double the Rent + Rent combo: play dbl1 first, then r1. */
  doubleRentCombo(): GameState {
    return baseState([
      player(
        'p1',
        [action('dbl1', 'double_the_rent', 1), rent('r1', ['red'])],
        [money('mb1', 5)],
        [
          {
            id: 'set_red',
            color: 'red',
            cards: [prop('rd1', 'red', 3), prop('rd2', 'red', 3)],
          },
        ],
      ),
      player('p2', [action('jsn1', 'just_say_no', 4)], [money('mb2', 4), money('mb3', 3)], []),
      player('p3', [], [money('mb4', 3)], []),
      player('p4', [], [money('mb5', 3)], []),
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

  /** A Deal Breaker in hand while no rival holds a complete set: nothing to take. */
  dealBreakerNoSets(): GameState {
    return baseState([
      player('p1', [action('dbk1', 'deal_breaker', 5)], [], []),
      player('p2', [], [], [{ id: 'set_yellow_part', color: 'yellow', cards: [prop('y1', 'yellow', 3)] }]),
    ]);
  },

  /** A Sly Deal and a Forced Deal in hand while the only rival property sits in a complete set: nothing to take. */
  stealNoTargets(): GameState {
    return baseState([
      player('p1', [action('sd1', 'sly_deal', 3), action('fd1', 'forced_deal', 3)], [], []),
      player('p2', [], [], [{ id: 'set_brown_full', color: 'brown', cards: [prop('b1', 'brown', 1), prop('b2', 'brown', 1)] }]),
    ]);
  },

  /** A Sly Deal in hand and three rivals with different things to take: loose properties, a wild, a complete set and nothing at all. */
  slyDealPick(): GameState {
    return baseState([
      player('p1', [action('sd1', 'sly_deal', 3), money('m1', 2)], [money('mb1', 3)], []),
      player(
        'p2',
        [],
        [money('mb2', 2)],
        [
          { id: 'set_red_part', color: 'red', cards: [prop('r1', 'red', 3), prop('r2', 'red', 3)] },
          { id: 'set_lb_part', color: 'light_blue', cards: [prop('lb1', 'light_blue', 1)] },
          { id: 'set_brown_full', color: 'brown', cards: [prop('b1', 'brown', 1), prop('b2', 'brown', 1)] },
        ],
      ),
      player(
        'p3',
        [],
        [],
        [
          { id: 'set_orange_part', color: 'orange', cards: [prop('o1', 'orange', 2), wild('w1', ['orange', 'pink'], 'orange')] },
          { id: 'set_green_part', color: 'green', cards: [prop('g1', 'green', 4)] },
        ],
      ),
      player('p4', [], [money('mb4', 1)], []),
    ]);
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

  debtCollectorChoice(): GameState {
    return baseState([
      player('p1', [action('dc1', 'debt_collector', 3)], [], []),
      player('p2', [], [money('p2b', 5)], []),
      player('p3', [], [money('p3b', 2)], []),
      player('p4', [], [], []),
    ]);
  },

  /** Debt Collector with a single rival: there is nobody to choose between, so the pick answers itself. */
  debtCollectorSoleRival(): GameState {
    return baseState([
      player('p1', [action('dc1', 'debt_collector', 3)], [], []),
      player('p2', [], [money('p2b', 5)], []),
    ]);
  },

  parallelRentCollection(): GameState {
    return baseState([
      player(
        'p1',
        [rent('rent_brown_lb', ['brown', 'light_blue'])],
        [],
        [
          {
            id: 'set_brown',
            color: 'brown',
            cards: [prop('b1', 'brown', 1), prop('b2', 'brown', 1)],
          },
        ],
      ),
      player('p2', [], [money('p2m', 3)], []),
      player('p3', [], [money('p3m', 2)], []),
      player('p4', [], [money('p4m', 1)], []),
    ]);
  },

  parallelBirthdayCollection(): GameState {
    return baseState([
      player('p1', [action('bd1', 'its_my_birthday', 2)], [], []),
      player('p2', [], [money('p2b', 2)], []),
      player('p3', [], [money('p3b', 2)], []),
      player('p4', [], [money('p4b', 1)], []),
    ]);
  },

  wildcardUsage(): GameState {
    return baseState([
      player(
        'p1',
        [wild('wc_dual', ['light_blue', 'pink']), wild('wc_multi', [])],
        [],
        [
          {
            id: 'set_red_wild',
            color: 'red',
            cards: [prop('rw1', 'red', 3), prop('rw2', 'red', 3), wild('rw_wild', ['red', 'yellow'], 'red')],
          },
        ],
      ),
      player('p2', [], [], []),
      player('p3', [], [], []),
      player('p4', [], [], []),
    ]);
  },

  /**
   * Layout stress: p1 holds one set of every colour, none complete, with mixed card counts —
   * exercises seat container overflow (own seat and, from another seat, as a rival).
   */
  tenIncompleteSets(): GameState {
    const incomplete: [PropertyColor, number][] = [
      ['brown', 1],
      ['light_blue', 2],
      ['pink', 1],
      ['orange', 2],
      ['red', 1],
      ['yellow', 2],
      ['green', 1],
      ['dark_blue', 1],
      ['railroad', 3],
      ['utility', 1],
    ];
    const sets: PropertySet[] = incomplete.map(([color, count]) => ({
      id: `set_${color}`,
      color,
      cards: Array.from({ length: count }, (_, i) =>
        prop(`${color}_${i + 1}`, color, PROPERTY_SET_DEFS[color].value),
      ),
    }));
    return baseState([
      player('p1', [money('m1', 2), action('pg1', 'pass_go', 1)], [money('mb1', 5), money('mb2', 1)], sets),
      player('p2', [money('m2', 1)], [money('mb3', 3)], []),
      player('p3', [], [money('mb4', 2)], []),
      player('p4', [], [], []),
    ]);
  },

  /**
   * A House and a Hotel in hand over several complete sets: light blue and brown can take the house, a full railroad
   * never can (and neither can the unfinished orange set), so the build choice lists exactly two.
   */
  buildingChoice(): GameState {
    return baseState([
      player(
        'p1',
        [action('hz1', 'house', 3), action('ht1', 'hotel', 4), money('m1', 2)],
        [money('mb1', 5)],
        [
          { id: 'set_lb', color: 'light_blue', cards: [prop('lb1', 'light_blue', 1), prop('lb2', 'light_blue', 1), prop('lb3', 'light_blue', 1)] },
          { id: 'set_brown', color: 'brown', cards: [prop('br1', 'brown', 1), prop('br2', 'brown', 1)] },
          { id: 'set_rr', color: 'railroad', cards: [1, 2, 3, 4].map((n) => prop(`rr${n}`, 'railroad', 2)) },
          { id: 'set_orange', color: 'orange', cards: [prop('o1', 'orange', 2), prop('o2', 'orange', 2)] },
        ],
      ),
      player('p2', [money('m2', 1)], [money('mb3', 3)], []),
      player('p3', [], [money('mb4', 2)], []),
      player('p4', [], [], []),
    ]);
  },

  /**
   * A ten-colour Wild Rent over a crowded table (light blue complete, the rest partial): every colour you own is
   * offered, so the rent pick has to stay legible with many amounts on screen.
   */
  wildRentPick(): GameState {
    const held: [PropertyColor, number][] = [
      ['brown', 1],
      ['light_blue', 3],
      ['pink', 1],
      ['orange', 2],
      ['red', 1],
      ['yellow', 2],
      ['green', 1],
      ['dark_blue', 1],
      ['railroad', 3],
      ['utility', 1],
    ];
    const sets: PropertySet[] = held.map(([color, count]) => ({
      id: `set_${color}`,
      color,
      cards: Array.from({ length: count }, (_, i) => prop(`${color}_${i + 1}`, color, PROPERTY_SET_DEFS[color].value)),
    }));
    return baseState([
      player('p1', [rent('rw1', [], 'wild'), money('m1', 2)], [money('mb1', 5), money('mb2', 1)], sets),
      player('p2', [money('m2', 1)], [money('mb3', 3)], []),
      player('p3', [], [money('mb4', 2)], []),
    ]);
  },

  /** Table stress test: five players; three hold ten incomplete sets (one card per colour), two hold six. */
  crowdedTable(): GameState {
    const colors = Object.keys(PROPERTY_SET_DEFS) as PropertyColor[];
    const setsFor = (pid: string, count = colors.length): PropertySet[] =>
      colors.slice(0, count).map((color) => ({
        id: `${pid}_set_${color}`,
        color,
        cards: [prop(`${pid}_${color}_1`, color, PROPERTY_SET_DEFS[color].value)],
      }));
    return baseState([
      player('p1', [money('m1', 2), action('pg1', 'pass_go', 1), action('sd1', 'sly_deal', 3)], [money('mb1', 5)], setsFor('p1')),
      player('p2', [money('m2', 1)], [money('mb2', 3)], setsFor('p2')),
      player('p3', [money('m3', 1)], [money('mb3', 2)], setsFor('p3')),
      player('p4', [money('m4', 1)], [money('mb4', 2)], setsFor('p4', 6)),
      player('p5', [money('m5', 1)], [money('mb5', 2)], setsFor('p5', 6)),
    ]);
  },
};

export type FixtureName = keyof typeof fixtures;
