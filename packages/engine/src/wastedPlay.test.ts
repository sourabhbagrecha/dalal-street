import { describe, expect, it } from 'vitest';
import type {
  ActionCard,
  Card,
  ClientGameState,
  ClientPlayerPublic,
  PlayerBoard,
  PropertyCard,
  PropertyColor,
  PropertySet,
  PropertyWildCard,
  RentCard,
} from '@monopoly-deal/shared';
import { MAX_PLAYS, PROPERTY_SET_DEFS } from '@monopoly-deal/shared';
import { rentEligibleColors, wastedDiscardPlay } from './wastedPlay.js';

let seq = 0;
const id = (p: string) => `${p}_${++seq}`;

function prop(color: PropertyColor, i = 0): PropertyCard {
  const names = PROPERTY_SET_DEFS[color].names;
  return { id: id('prop'), kind: 'property', color, value: 2, name: names[i % names.length]! };
}
function wild(colors: PropertyColor[], assignedColor?: PropertyColor): PropertyWildCard {
  return {
    id: id('wild'),
    kind: 'property_wild',
    colors,
    value: colors.length === 0 ? 0 : 4,
    ...(assignedColor ? { assignedColor } : {}),
  };
}
function rent(colors: PropertyColor[], rentType: 'dual' | 'wild' = 'dual'): RentCard {
  return { id: id('rent'), kind: 'rent', rentType, colors, value: rentType === 'wild' ? 3 : 1 };
}
function action(a: ActionCard['action']): ActionCard {
  return { id: id('act'), kind: 'action', action: a, value: 3 };
}
function money(amount: number): Card {
  return { id: id('money'), kind: 'money', amount, value: amount };
}
function set(color: PropertyColor, cards: Card[], extra: Partial<PropertySet> = {}): PropertySet {
  return { id: id('set'), color, cards, ...extra };
}
/** A full set of `color`, built from plain properties. */
function fullSet(color: PropertyColor): PropertySet {
  const size = PROPERTY_SET_DEFS[color].names.length;
  return set(
    color,
    Array.from({ length: size }, (_, i) => prop(color, i)),
  );
}
function board(sets: PropertySet[] = [], bank: Card[] = []): PlayerBoard {
  return { bank, sets };
}

function stateWith(
  you: { hand: Card[]; board?: PlayerBoard },
  opponentBoards: PlayerBoard[] = [board()],
  overrides: Partial<ClientGameState> = {},
): ClientGameState {
  const yourBoard = you.board ?? board();
  const opponents: ClientPlayerPublic[] = opponentBoards.map((b, i) => ({
    id: `opp${i}`,
    board: b,
    handCount: 3,
    connected: true,
  }));
  return {
    v: 1,
    viewerId: 'me',
    you: { id: 'me', board: yourBoard, handCount: you.hand.length, connected: true, hand: you.hand },
    players: [
      { id: 'me', board: yourBoard, handCount: you.hand.length, connected: true },
      ...opponents,
    ],
    deckCount: 40,
    discardCount: 0,
    discardTop: null,
    currentPlayerId: 'me',
    playsRemaining: MAX_PLAYS,
    turnPhase: 'playing',
    pendingStack: [],
    pendingDoubles: 0,
    winnerId: null,
    turnNumber: 1,
    drawnThisTurn: true,
    ...overrides,
  };
}

describe('rentEligibleColors', () => {
  it('keeps only colors the player actually owns', () => {
    const b = board([set('red', [prop('red')])]);
    expect(rentEligibleColors(b, rent(['red', 'yellow']))).toEqual(['red']);
    expect(rentEligibleColors(b, rent(['green', 'dark_blue']))).toEqual([]);
  });

  it('treats a set holding only a multicolor wild as unrentable for wild rent', () => {
    const b = board([set('red', [wild([], 'red')])]);
    expect(rentEligibleColors(b, rent([], 'wild'))).toEqual([]);
    expect(rentEligibleColors(board([set('red', [wild([], 'red'), prop('red')])]), rent([], 'wild'))).toEqual([
      'red',
    ]);
  });
});

describe('wastedDiscardPlay', () => {
  it('returns null for a card that is not in hand', () => {
    expect(wastedDiscardPlay(stateWith({ hand: [] }), 'nope')).toBeNull();
  });

  it('flags a rent card with no matching properties', () => {
    const r = rent(['green', 'dark_blue']);
    const s = stateWith({ hand: [r], board: board([set('red', [prop('red')])]) });
    expect(wastedDiscardPlay(s, r.id)).toEqual({ kind: 'rent_no_colors' });
  });

  it('allows a rent card that matches something on the board', () => {
    const r = rent(['red', 'yellow']);
    const s = stateWith({ hand: [r], board: board([set('red', [prop('red')])]) });
    expect(wastedDiscardPlay(s, r.id)).toBeNull();
  });

  it('flags sly deal when every opponent property sits in a complete set', () => {
    const a = action('sly_deal');
    const s = stateWith({ hand: [a] }, [board([fullSet('brown')])]);
    expect(wastedDiscardPlay(s, a.id)).toEqual({ kind: 'sly_deal_no_targets' });
  });

  it('allows sly deal when an opponent has a loose property', () => {
    const a = action('sly_deal');
    const s = stateWith({ hand: [a] }, [board([set('red', [prop('red')])])]);
    expect(wastedDiscardPlay(s, a.id)).toBeNull();
  });

  it('distinguishes forced deal with nothing to give from nothing to take', () => {
    const a = action('forced_deal');
    const noOwn = stateWith({ hand: [a] }, [board([set('red', [prop('red')])])]);
    expect(wastedDiscardPlay(noOwn, a.id)).toEqual({ kind: 'forced_deal_no_own' });

    const noTheirs = stateWith({ hand: [a], board: board([set('red', [prop('red')])]) }, [
      board([fullSet('brown')]),
    ]);
    expect(wastedDiscardPlay(noTheirs, a.id)).toEqual({ kind: 'forced_deal_no_targets' });
  });

  it('flags deal breaker when no opponent has a complete set', () => {
    const a = action('deal_breaker');
    const s = stateWith({ hand: [a] }, [board([set('brown', [prop('brown')])])]);
    expect(wastedDiscardPlay(s, a.id)).toEqual({ kind: 'deal_breaker_no_sets' });
    const ok = stateWith({ hand: [a] }, [board([fullSet('brown')])]);
    expect(wastedDiscardPlay(ok, a.id)).toBeNull();
  });

  it('flags a house with no completed set, and a hotel with no house', () => {
    const house = action('house');
    const hotel = action('hotel');
    const bare = stateWith({ hand: [house, hotel], board: board([set('brown', [prop('brown')])]) });
    expect(wastedDiscardPlay(bare, house.id)).toEqual({ kind: 'building_no_set', building: 'house' });
    expect(wastedDiscardPlay(bare, hotel.id)).toEqual({ kind: 'building_no_set', building: 'hotel' });

    const complete = stateWith({ hand: [house, hotel], board: board([fullSet('brown')]) });
    expect(wastedDiscardPlay(complete, house.id)).toBeNull();
    expect(wastedDiscardPlay(complete, hotel.id)).toEqual({
      kind: 'building_no_set',
      building: 'hotel',
    });

    const withHouse = fullSet('brown');
    withHouse.house = action('house');
    const housed = stateWith({ hand: [house, hotel], board: board([withHouse]) });
    expect(wastedDiscardPlay(housed, hotel.id)).toBeNull();
  });

  it('never lets a house or hotel onto railroads or utilities', () => {
    const house = action('house');
    const s = stateWith({ hand: [house], board: board([fullSet('railroad')]) });
    expect(wastedDiscardPlay(s, house.id)).toEqual({ kind: 'building_no_set', building: 'house' });
  });

  it('flags double the rent with no usable rent card', () => {
    const dtr = action('double_the_rent');
    const unusable = rent(['green', 'dark_blue']);
    const s = stateWith({ hand: [dtr, unusable], board: board([set('red', [prop('red')])]) });
    expect(wastedDiscardPlay(s, dtr.id)).toEqual({ kind: 'double_rent_no_rent' });
  });

  it('flags double the rent played on the last play of the turn', () => {
    const dtr = action('double_the_rent');
    const usable = rent(['red', 'yellow']);
    const b = board([set('red', [prop('red')])]);
    expect(
      wastedDiscardPlay(stateWith({ hand: [dtr, usable], board: b }, [board()], { playsRemaining: 1 }), dtr.id),
    ).toEqual({ kind: 'double_rent_no_plays' });
    expect(
      wastedDiscardPlay(stateWith({ hand: [dtr, usable], board: b }, [board()], { playsRemaining: 2 }), dtr.id),
    ).toBeNull();
  });

  it('flags debt collector and birthday only when every opponent is broke', () => {
    const debt = action('debt_collector');
    const birthday = action('its_my_birthday');
    const broke = stateWith({ hand: [debt, birthday] }, [board(), board()]);
    expect(wastedDiscardPlay(broke, debt.id)).toEqual({
      kind: 'nobody_can_pay',
      action: 'debt_collector',
    });
    expect(wastedDiscardPlay(broke, birthday.id)).toEqual({
      kind: 'nobody_can_pay',
      action: 'its_my_birthday',
    });

    const oneRich = stateWith({ hand: [debt, birthday] }, [board(), board([], [money(2)])]);
    expect(wastedDiscardPlay(oneRich, debt.id)).toBeNull();
    expect(wastedDiscardPlay(oneRich, birthday.id)).toBeNull();
  });

  it('leaves pass go and non-action cards alone', () => {
    const passGo = action('pass_go');
    const cash = money(5);
    const s = stateWith({ hand: [passGo, cash] }, [board()]);
    expect(wastedDiscardPlay(s, passGo.id)).toBeNull();
    expect(wastedDiscardPlay(s, cash.id)).toBeNull();
  });
});
