import { describe, expect, it } from 'vitest';
import type {
  Card,
  Command,
  GameState,
  PlayerState,
  PropertyColor,
  PropertySet,
} from '@monopoly-deal/shared';
import { MAX_PLAYS, NO_TARGET, SET_SIZES } from '@monopoly-deal/shared';
import { createGame } from './createGame.js';
import { dispatch } from './dispatch.js';
import { fixtures } from './fixtures.js';
import { buildDeck } from './deck.js';
import {
  countCompleteSets,
  isCompleteSet,
  removalCost,
  rentForSet,
} from './board.js';
import { getLegalCommands, getLegalRearranges, isValidPaymentSelection } from './validators.js';

function take<T extends Card>(
  pool: Card[],
  pred: (c: Card) => boolean,
): T {
  const i = pool.findIndex(pred);
  if (i < 0) throw new Error('card not found in pool');
  return pool.splice(i, 1)[0] as T;
}

function makeState(players: PlayerState[], rest: Partial<GameState> = {}): GameState {
  const deckAll = buildDeck();
  const used = new Set<string>();
  const mark = (c: Card) => used.add(c.id);
  for (const p of players) {
    p.hand.forEach(mark);
    p.board.bank.forEach(mark);
    for (const s of p.board.sets) {
      s.cards.forEach(mark);
      if (s.house) mark(s.house);
      if (s.hotel) mark(s.hotel);
    }
  }
  const discard = rest.discard ?? [];
  discard.forEach(mark);
  const outOfPlay = rest.outOfPlay ?? deckAll.filter((c) => c.kind === 'rule');
  outOfPlay.forEach(mark);
  const deck = rest.deck ?? deckAll.filter((c) => !used.has(c.id));
  return {
    players,
    deck,
    discard,
    outOfPlay,
    currentPlayerIndex: rest.currentPlayerIndex ?? 0,
    playsRemaining: rest.playsRemaining ?? MAX_PLAYS,
    turnPhase: rest.turnPhase ?? 'playing',
    pendingStack: rest.pendingStack ?? [],
    pendingDoubles: rest.pendingDoubles ?? 0,
    winnerId: rest.winnerId ?? null,
    seed: rest.seed ?? 99,
    turnNumber: rest.turnNumber ?? 3,
    drawnThisTurn: rest.drawnThisTurn ?? true,
    nextSetId: rest.nextSetId ?? 1,
  };
}

function setOf(color: PropertyColor, cards: Card[], extra?: Partial<PropertySet>): PropertySet {
  return { id: `set_${color}_${cards[0]?.id ?? 'x'}`, color, cards, ...extra };
}

describe('Pass Go', () => {
  it('draws 2 extra cards', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const pg = take(pool, (c) => c.kind === 'action' && c.action === 'pass_go');
    const p1: PlayerState = {
      id: 'p1',
      hand: [pg],
      board: { bank: [], sets: [] },
    };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [] } };
    const state = makeState([p1, p2], { deck: pool });
    const before = state.deck.length;
    const r = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: pg.id,
      zone: 'discard',
    });
    expect(r.rejected).toBeUndefined();
    expect(r.state.players[0]!.hand.length).toBe(2);
    expect(r.state.deck.length).toBe(before - 2);
    expect(r.state.playsRemaining).toBe(2);
  });
});

describe('Rent + Double the Rent', () => {
  it('costs no play of its own and doubles rent', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const dbl = take(pool, (c) => c.kind === 'action' && c.action === 'double_the_rent');
    const rent = take(
      pool,
      (c) => c.kind === 'rent' && c.rentType === 'dual' && c.colors.includes('brown'),
    );
    const b1 = take(pool, (c) => c.kind === 'property' && c.color === 'brown');
    const b2 = take(pool, (c) => c.kind === 'property' && c.color === 'brown');
    const money = take(pool, (c) => c.kind === 'money' && c.value >= 4);
    const p1: PlayerState = {
      id: 'p1',
      hand: [dbl, rent],
      board: { bank: [], sets: [setOf('brown', [b1, b2])] },
    };
    const p2: PlayerState = {
      id: 'p2',
      hand: [],
      board: { bank: [money], sets: [] },
    };
    let state = makeState([p1, p2]);
    // Complete brown rent base = 2; doubled = 4
    expect(rentForSet(p1.board.sets[0]!)).toBe(2);

    let r = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: dbl.id,
      zone: 'discard',
    });
    expect(r.rejected).toBeUndefined();
    state = r.state;
    expect(state.playsRemaining).toBe(3);
    expect(state.pendingDoubles).toBe(1);

    r = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: rent.id,
      zone: 'discard',
      target: { rentColor: 'brown' },
    });
    expect(r.rejected).toBeUndefined();
    state = r.state;
    expect(state.playsRemaining).toBe(2);
    // Should have payment round for 4
    const round = state.pendingStack.find((p) => p.kind === 'payment_round');
    expect(round?.kind).toBe('payment_round');
    if (round?.kind === 'payment_round') {
      expect(round.entries[0]?.amountDue).toBe(4);
    }
  });

  it('still leaves the last play for the rent card', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const dbl = take(pool, (c) => c.kind === 'action' && c.action === 'double_the_rent');
    const rent = take(
      pool,
      (c) => c.kind === 'rent' && c.rentType === 'dual' && c.colors.includes('brown'),
    );
    const b1 = take(pool, (c) => c.kind === 'property' && c.color === 'brown');
    const money = take(pool, (c) => c.kind === 'money' && c.value >= 4);
    const p1: PlayerState = {
      id: 'p1',
      hand: [dbl, rent],
      board: { bank: [], sets: [setOf('brown', [b1])] },
    };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [money], sets: [] } };
    let state = makeState([p1, p2], { playsRemaining: 1 });

    let r = dispatch(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: dbl.id, zone: 'discard' });
    expect(r.rejected).toBeUndefined();
    state = r.state;
    expect(state.playsRemaining).toBe(1);
    expect(state.pendingDoubles).toBe(1);

    r = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: rent.id,
      zone: 'discard',
      target: { rentColor: 'brown' },
    });
    expect(r.rejected).toBeUndefined();
    expect(r.state.playsRemaining).toBe(0);
    const round = r.state.pendingStack.find((p) => p.kind === 'payment_round');
    expect(round?.kind === 'payment_round' && round.entries[0]?.amountDue).toBe(2);
  });

  it('wild rent with one rentable set skips the colour pick and asks who pays', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const rent = take(pool, (c) => c.kind === 'rent' && c.rentType === 'wild');
    const b1 = take(pool, (c) => c.kind === 'property' && c.color === 'brown');
    const p1: PlayerState = { id: 'p1', hand: [rent], board: { bank: [], sets: [setOf('brown', [b1])] } };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [] } };
    const r = dispatch(makeState([p1, p2]), { type: 'PLAY_CARD', playerId: 'p1', cardId: rent.id, zone: 'discard' });
    expect(r.rejected).toBeUndefined();
    const top = r.state.pendingStack[r.state.pendingStack.length - 1];
    expect(top?.kind).toBe('rent_player_choice');
    expect(top?.kind === 'rent_player_choice' && top.color).toBe('brown');
    expect(top?.kind === 'rent_player_choice' && top.amount).toBe(rentForSet(p1.board.sets[0]!));
  });
});

describe('Debt Collector', () => {
  it('demands 5Cr with payment pending', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const dc = take(pool, (c) => c.kind === 'action' && c.action === 'debt_collector');
    const m = take(pool, (c) => c.kind === 'money' && c.value === 5);
    const p1: PlayerState = { id: 'p1', hand: [dc], board: { bank: [], sets: [] } };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [m], sets: [] } };
    const state = makeState([p1, p2]);
    let r = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: dc.id,
      zone: 'discard',
    });
    expect(r.rejected).toBeUndefined();
    expect(r.state.pendingStack[0]?.kind).toBe('debt_collector_target');
    r = dispatch(r.state, {
      type: 'SELECT_DEBT_COLLECTOR_PLAYER',
      playerId: 'p1',
      targetPlayerId: 'p2',
    });
    expect(r.rejected).toBeUndefined();
    // p2 holds no Just Say No but still gets the window, so nobody can tell; letting it go opens the payment.
    expect(r.state.pendingStack[r.state.pendingStack.length - 1]?.kind).toBe('just_say_no');
    r = dispatch(r.state, { type: 'DECLINE_JUST_SAY_NO', playerId: 'p2' });
    expect(r.rejected).toBeUndefined();
    const top = r.state.pendingStack[r.state.pendingStack.length - 1];
    expect(top?.kind).toBe('payment');
    if (top?.kind === 'payment') expect(top.amountDue).toBe(5);
  });
});

describe("It's My Birthday", () => {
  it('charges each other player 2Cr', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const bd = take(pool, (c) => c.kind === 'action' && c.action === 'its_my_birthday');
    const m2 = take(pool, (c) => c.kind === 'money' && c.value === 2);
    const m3 = take(pool, (c) => c.kind === 'money' && c.value === 3);
    const p1: PlayerState = { id: 'p1', hand: [bd], board: { bank: [], sets: [] } };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [m2], sets: [] } };
    const p3: PlayerState = { id: 'p3', hand: [], board: { bank: [m3], sets: [] } };
    const r = dispatch(makeState([p1, p2, p3]), {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: bd.id,
      zone: 'discard',
    });
    expect(r.rejected).toBeUndefined();
    const round = r.state.pendingStack.find((p) => p.kind === 'payment_round');
    expect(round?.kind).toBe('payment_round');
    if (round?.kind === 'payment_round') {
      expect(round.entries.length).toBeGreaterThanOrEqual(2);
      expect(round.entries.every((e) => e.amountDue === 2)).toBe(true);
    }
  });
});

describe('Parallel payment round', () => {
  it('dual rent allows all opponents to pay simultaneously', () => {
    let state = fixtures.parallelRentCollection();
    const rent = state.players[0]!.hand[0]!;
    const r = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: rent.id,
      zone: 'discard',
      target: { rentColor: 'brown' },
    });
    expect(r.rejected).toBeUndefined();
    state = r.state;
    const round = state.pendingStack[state.pendingStack.length - 1];
    expect(round?.kind).toBe('payment_round');
    if (round?.kind !== 'payment_round') return;

    const cmds = getLegalCommands(state);
    const payers = cmds
      .filter((c): c is Extract<Command, { type: 'SELECT_PAYMENT' }> => c.type === 'SELECT_PAYMENT')
      .map((c) => c.playerId);
    expect(payers).toEqual(expect.arrayContaining(['p2', 'p3', 'p4']));

    const p2Pay = cmds.find(
      (c): c is Extract<Command, { type: 'SELECT_PAYMENT' }> =>
        c.type === 'SELECT_PAYMENT' && c.playerId === 'p2',
    );
    expect(p2Pay).toBeDefined();
    const afterP2 = dispatch(state, p2Pay!);
    expect(afterP2.rejected).toBeUndefined();
    const stillOpen = getLegalCommands(afterP2.state).some(
      (c) => c.type === 'SELECT_PAYMENT' && c.playerId === 'p3',
    );
    expect(stillOpen).toBe(true);
  });
});

describe('Payment selection', () => {
  it('accepts two ₹1Cr cards to pay ₹2Cr debt', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const m1a = take(pool, (c) => c.kind === 'money' && c.value === 1);
    const m1b = take(pool, (c) => c.kind === 'money' && c.value === 1);
    const m5 = take(pool, (c) => c.kind === 'money' && c.value === 5);
    const p1: PlayerState = { id: 'p1', hand: [], board: { bank: [], sets: [] } };
    const p2: PlayerState = {
      id: 'p2',
      hand: [],
      board: { bank: [m1a, m1b, m5], sets: [] },
    };
    const state = makeState([p1, p2], {
      pendingStack: [
        {
          kind: 'payment',
          payerId: 'p2',
          payeeId: 'p1',
          amountDue: 2,
          reason: 'birthday',
        },
      ],
    });

    expect(isValidPaymentSelection(state, 'p2', 2, [m1a.id, m1b.id])).toBe(true);

    const cmds = getLegalCommands(state).filter(
      (c): c is Extract<Command, { type: 'SELECT_PAYMENT' }> => c.type === 'SELECT_PAYMENT',
    );
    expect(
      cmds.some(
        (c) =>
          c.playerId === 'p2' &&
          c.cardIds.length === 2 &&
          c.cardIds.includes(m1a.id) &&
          c.cardIds.includes(m1b.id),
      ),
    ).toBe(true);

    const r = dispatch(state, {
      type: 'SELECT_PAYMENT',
      playerId: 'p2',
      cardIds: [m1a.id, m1b.id],
    });
    expect(r.rejected).toBeUndefined();
    expect(r.state.players[1]!.board.bank).toHaveLength(1);
    expect(r.state.players[1]!.board.bank[0]?.value).toBe(5);
  });

  it('limits payment command explosion with many bank cards', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const moneyCards = pool.filter((c) => c.kind === 'money').slice(0, 12);
    const p1: PlayerState = { id: 'p1', hand: [], board: { bank: [], sets: [] } };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: moneyCards, sets: [] } };
    const state = makeState([p1, p2], {
      pendingStack: [
        {
          kind: 'payment',
          payerId: 'p2',
          payeeId: 'p1',
          amountDue: 2,
          reason: 'rent',
        },
      ],
    });
    const paymentCmds = getLegalCommands(state).filter((c) => c.type === 'SELECT_PAYMENT');
    expect(paymentCmds.length).toBeLessThanOrEqual(40);
  });
});

describe('Sly Deal', () => {
  it('steals a property from an incomplete set', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const sly = take(pool, (c) => c.kind === 'action' && c.action === 'sly_deal');
    const red = take(pool, (c) => c.kind === 'property' && c.color === 'red');
    const p1: PlayerState = { id: 'p1', hand: [sly], board: { bank: [], sets: [] } };
    const p2: PlayerState = {
      id: 'p2',
      hand: [],
      board: { bank: [], sets: [setOf('red', [red])] },
    };
    let state = makeState([p1, p2]);
    let r = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: sly.id,
      zone: 'discard',
    });
    state = r.state!;
    r = dispatch(state, {
      type: 'SELECT_STEAL_TARGET',
      playerId: 'p1',
      targetCardId: red.id,
    });
    expect(r.rejected).toBeUndefined();
    // p2 holds no Just Say No but is still asked.
    r = dispatch(r.state, { type: 'DECLINE_JUST_SAY_NO', playerId: 'p2' });
    expect(r.rejected).toBeUndefined();
    expect(r.state.players[0]!.board.sets.some((s) => s.cards.some((c) => c.id === red.id))).toBe(
      true,
    );
  });
});

/** Play `cardId` from p1's hand to the discard pile, then answer its target with "nothing to take". */
function playThenNoTarget(state: GameState, cardId: string) {
  const played = dispatch(state, { type: 'PLAY_CARD', playerId: 'p1', cardId, zone: 'discard' });
  expect(played.rejected).toBeUndefined();
  return {
    legal: getLegalCommands(played.state),
    r: dispatch(played.state, { type: 'SELECT_STEAL_TARGET', playerId: 'p1', targetCardId: NO_TARGET }),
  };
}

describe('Sly Deal with nothing to take', () => {
  it('resolves as a spent play when every rival property is in a complete set', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const sly = take(pool, (c) => c.kind === 'action' && c.action === 'sly_deal');
    const browns = [0, 1].map(() => take(pool, (c) => c.kind === 'property' && c.color === 'brown'));
    const p1: PlayerState = { id: 'p1', hand: [sly], board: { bank: [], sets: [] } };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [setOf('brown', browns)] } };
    const { legal, r } = playThenNoTarget(makeState([p1, p2]), sly.id);
    expect(legal).toContainEqual({ type: 'SELECT_STEAL_TARGET', playerId: 'p1', targetCardId: NO_TARGET });
    expect(r.rejected).toBeUndefined();
    expect(r.state.pendingStack).toHaveLength(0);
    expect(r.state.playsRemaining).toBe(MAX_PLAYS - 1);
    expect(r.state.players[1]!.board.sets[0]!.cards).toHaveLength(2);
  });

  it('is refused while a rival has a property to take', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const sly = take(pool, (c) => c.kind === 'action' && c.action === 'sly_deal');
    const red = take(pool, (c) => c.kind === 'property' && c.color === 'red');
    const p1: PlayerState = { id: 'p1', hand: [sly], board: { bank: [], sets: [] } };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [setOf('red', [red])] } };
    const { legal, r } = playThenNoTarget(makeState([p1, p2]), sly.id);
    expect(legal).not.toContainEqual(expect.objectContaining({ targetCardId: NO_TARGET }));
    expect(r.rejected).toBeDefined();
  });
});

describe('Forced Deal with nothing to swap', () => {
  it('resolves as a spent play when you have no property to give', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const fd = take(pool, (c) => c.kind === 'action' && c.action === 'forced_deal');
    const theirs = take(pool, (c) => c.kind === 'property' && c.color === 'yellow');
    const p1: PlayerState = { id: 'p1', hand: [fd], board: { bank: [], sets: [] } };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [setOf('yellow', [theirs])] } };
    const { legal, r } = playThenNoTarget(makeState([p1, p2]), fd.id);
    expect(legal).toContainEqual({ type: 'SELECT_STEAL_TARGET', playerId: 'p1', targetCardId: NO_TARGET });
    expect(r.rejected).toBeUndefined();
    expect(r.state.pendingStack).toHaveLength(0);
    expect(r.state.playsRemaining).toBe(MAX_PLAYS - 1);
  });

  it('is refused while a swap is possible', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const fd = take(pool, (c) => c.kind === 'action' && c.action === 'forced_deal');
    const mine = take(pool, (c) => c.kind === 'property' && c.color === 'orange');
    const theirs = take(pool, (c) => c.kind === 'property' && c.color === 'yellow');
    const p1: PlayerState = { id: 'p1', hand: [fd], board: { bank: [], sets: [setOf('orange', [mine])] } };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [setOf('yellow', [theirs])] } };
    const { r } = playThenNoTarget(makeState([p1, p2]), fd.id);
    expect(r.rejected).toBeDefined();
  });
});

describe('Forced Deal', () => {
  it('swaps properties', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const fd = take(pool, (c) => c.kind === 'action' && c.action === 'forced_deal');
    const mine = take(pool, (c) => c.kind === 'property' && c.color === 'orange');
    const theirs = take(pool, (c) => c.kind === 'property' && c.color === 'yellow');
    const p1: PlayerState = {
      id: 'p1',
      hand: [fd],
      board: { bank: [], sets: [setOf('orange', [mine])] },
    };
    const p2: PlayerState = {
      id: 'p2',
      hand: [],
      board: { bank: [], sets: [setOf('yellow', [theirs])] },
    };
    let state = makeState([p1, p2]);
    let r = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: fd.id,
      zone: 'discard',
    });
    state = r.state;
    r = dispatch(state, {
      type: 'SELECT_STEAL_TARGET',
      playerId: 'p1',
      targetCardId: theirs.id,
      ownCardId: mine.id,
    });
    expect(r.rejected).toBeUndefined();
    r = dispatch(r.state, { type: 'DECLINE_JUST_SAY_NO', playerId: 'p2' });
    expect(r.rejected).toBeUndefined();
    expect(r.state.players[0]!.board.sets.some((s) => s.cards.some((c) => c.id === theirs.id))).toBe(
      true,
    );
    expect(r.state.players[1]!.board.sets.some((s) => s.cards.some((c) => c.id === mine.id))).toBe(
      true,
    );
  });
});

describe('Deal Breaker', () => {
  it('can be banked as ₹5Cr even when no steal target exists', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const db = take(pool, (c) => c.kind === 'action' && c.action === 'deal_breaker');
    const p1: PlayerState = { id: 'p1', hand: [db], board: { bank: [], sets: [] } };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [] } };
    const state = makeState([p1, p2]);
    const bankCmd = getLegalCommands(state).find(
      (c) =>
        c.type === 'PLAY_CARD' &&
        c.playerId === 'p1' &&
        c.cardId === db.id &&
        c.zone === 'bank',
    );
    expect(bankCmd).toBeDefined();
    const r = dispatch(state, bankCmd as Command);
    expect(r.rejected).toBeUndefined();
    expect(r.state.players[0]!.board.bank).toHaveLength(1);
    expect(r.state.players[0]!.board.bank[0]?.id).toBe(db.id);
    expect(r.state.players[0]!.hand).toHaveLength(0);
  });

  it('steals a full set including house and hotel', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const db = take(pool, (c) => c.kind === 'action' && c.action === 'deal_breaker');
    const ys = [
      take(pool, (c) => c.kind === 'property' && c.color === 'yellow'),
      take(pool, (c) => c.kind === 'property' && c.color === 'yellow'),
      take(pool, (c) => c.kind === 'property' && c.color === 'yellow'),
    ];
    const house = take(pool, (c) => c.kind === 'action' && c.action === 'house');
    const hotel = take(pool, (c) => c.kind === 'action' && c.action === 'hotel');
    const full = setOf('yellow', ys, { house, hotel });
    const p1: PlayerState = { id: 'p1', hand: [db], board: { bank: [], sets: [] } };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [full] } };
    let state = makeState([p1, p2]);
    let r = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: db.id,
      zone: 'discard',
    });
    state = r.state;
    r = dispatch(state, {
      type: 'SELECT_STEAL_TARGET',
      playerId: 'p1',
      targetSetId: full.id,
    });
    expect(r.rejected).toBeUndefined();
    r = dispatch(r.state, { type: 'DECLINE_JUST_SAY_NO', playerId: 'p2' });
    expect(r.rejected).toBeUndefined();
    const got = r.state.players[0]!.board.sets[0];
    expect(got?.house).toBeTruthy();
    expect(got?.hotel).toBeTruthy();
    expect(isCompleteSet(got!)).toBe(true);
    expect(r.state.players[1]!.board.sets.length).toBe(0);
  });

  it('can cause a mid-payment win', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const db = take(pool, (c) => c.kind === 'action' && c.action === 'deal_breaker');
    // p1 already has 2 complete sets
    const browns = [
      take(pool, (c) => c.kind === 'property' && c.color === 'brown'),
      take(pool, (c) => c.kind === 'property' && c.color === 'brown'),
    ];
    const utils = [
      take(pool, (c) => c.kind === 'property' && c.color === 'utility'),
      take(pool, (c) => c.kind === 'property' && c.color === 'utility'),
    ];
    const darks = [
      take(pool, (c) => c.kind === 'property' && c.color === 'dark_blue'),
      take(pool, (c) => c.kind === 'property' && c.color === 'dark_blue'),
    ];
    const p1: PlayerState = {
      id: 'p1',
      hand: [db],
      board: {
        bank: [],
        sets: [setOf('brown', browns), setOf('utility', utils)],
      },
    };
    const p2: PlayerState = {
      id: 'p2',
      hand: [],
      board: { bank: [], sets: [setOf('dark_blue', darks)] },
    };
    let state = makeState([p1, p2]);
    let r = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: db.id,
      zone: 'discard',
    });
    state = r.state;
    r = dispatch(state, {
      type: 'SELECT_STEAL_TARGET',
      playerId: 'p1',
      targetSetId: p2.board.sets[0]!.id,
    });
    r = dispatch(r.state, { type: 'DECLINE_JUST_SAY_NO', playerId: 'p2' });
    expect(r.state.winnerId).toBe('p1');
    expect(countCompleteSets(r.state.players[0]!)).toBe(3);
  });
});

describe('House and Hotel', () => {
  it('places house then hotel on completed non-rail/util set', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const house = take(pool, (c) => c.kind === 'action' && c.action === 'house');
    const hotel = take(pool, (c) => c.kind === 'action' && c.action === 'hotel');
    const reds = [
      take(pool, (c) => c.kind === 'property' && c.color === 'red'),
      take(pool, (c) => c.kind === 'property' && c.color === 'red'),
      take(pool, (c) => c.kind === 'property' && c.color === 'red'),
    ];
    const s = setOf('red', reds);
    const p1: PlayerState = {
      id: 'p1',
      hand: [house, hotel],
      board: { bank: [], sets: [s] },
    };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [] } };
    let state = makeState([p1, p2]);
    let r = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: house.id,
      zone: 'discard',
    });
    state = r.state;
    r = dispatch(state, { type: 'SELECT_BUILDING_SET', playerId: 'p1', setId: s.id });
    expect(r.state.players[0]!.board.sets[0]!.house?.id).toBe(house.id);
    state = r.state;
    r = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: hotel.id,
      zone: 'discard',
    });
    state = r.state;
    r = dispatch(state, { type: 'SELECT_BUILDING_SET', playerId: 'p1', setId: s.id });
    expect(r.state.players[0]!.board.sets[0]!.hotel?.id).toBe(hotel.id);
    // Hotel replaces house bonus: complete red rent 6 + 4 = 10
    expect(rentForSet(r.state.players[0]!.board.sets[0]!)).toBe(10);
  });
});

describe('Just Say No', () => {
  it('cancels debt collector (single JSN)', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const dc = take(pool, (c) => c.kind === 'action' && c.action === 'debt_collector');
    const jsn = take(pool, (c) => c.kind === 'action' && c.action === 'just_say_no');
    const m = take(pool, (c) => c.kind === 'money' && c.value === 5);
    const p1: PlayerState = { id: 'p1', hand: [dc], board: { bank: [], sets: [] } };
    const p2: PlayerState = { id: 'p2', hand: [jsn], board: { bank: [m], sets: [] } };
    let state = makeState([p1, p2]);
    let r = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: dc.id,
      zone: 'discard',
    });
    state = r.state;
    expect(state.pendingStack[0]?.kind).toBe('debt_collector_target');
    r = dispatch(state, {
      type: 'SELECT_DEBT_COLLECTOR_PLAYER',
      playerId: 'p1',
      targetPlayerId: 'p2',
    });
    state = r.state;
    expect(state.pendingStack[0]?.kind).toBe('just_say_no');
    r = dispatch(state, {
      type: 'RESPOND_JUST_SAY_NO',
      playerId: 'p2',
      cardId: jsn.id,
    });
    // p1 has no counter but is still asked; letting it go cancels the action, no payment
    expect(r.state.pendingStack.at(-1)).toMatchObject({ kind: 'just_say_no', respondentId: 'p1', jsnCount: 1 });
    r = dispatch(r.state, { type: 'DECLINE_JUST_SAY_NO', playerId: 'p1' });
    expect(r.events.some((e) => e.type === 'action_cancelled')).toBe(true);
    expect(r.state.pendingStack.find((p) => p.kind === 'payment')).toBeUndefined();
    expect(r.state.players[1]!.board.bank).toHaveLength(1);
  });

  it('never tells the table who holds one: every window opens alike, held or not', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const sly = take(pool, (c) => c.kind === 'action' && c.action === 'sly_deal');
    const jsn = take(pool, (c) => c.kind === 'action' && c.action === 'just_say_no');
    const red = take(pool, (c) => c.kind === 'property' && c.color === 'red');
    const aim = (p2Hand: Card[]) => {
      const p1: PlayerState = { id: 'p1', hand: [sly], board: { bank: [], sets: [] } };
      const p2: PlayerState = { id: 'p2', hand: p2Hand, board: { bank: [], sets: [setOf('red', [red])] } };
      const r = dispatch(makeState([p1, p2]), { type: 'PLAY_CARD', playerId: 'p1', cardId: sly.id, zone: 'discard' });
      return dispatch(r.state, { type: 'SELECT_STEAL_TARGET', playerId: 'p1', targetCardId: red.id });
    };
    const held = aim([jsn]);
    const bare = aim([]);
    // Same pending, same events, whether p2 holds a Just Say No or not.
    expect(bare.state.pendingStack).toEqual(held.state.pendingStack);
    expect(bare.events).toEqual(held.events);
    expect(bare.state.pendingStack.at(-1)).toMatchObject({ kind: 'just_say_no', respondentId: 'p2' });
  });

  it('double chain: actor nos the no and action proceeds', () => {
    const state = fixtures.doubleJustSayNoChain();
    const jsnB = state.players[1]!.hand.find((c) => c.kind === 'action' && c.action === 'just_say_no')!;
    let r = dispatch(state, {
      type: 'RESPOND_JUST_SAY_NO',
      playerId: 'p2',
      cardId: jsnB.id,
    });
    expect(r.state.pendingStack[0]?.kind).toBe('just_say_no');
    const jsnA = r.state.players[0]!.hand.find((c) => c.kind === 'action' && c.action === 'just_say_no')!;
    r = dispatch(r.state, {
      type: 'RESPOND_JUST_SAY_NO',
      playerId: 'p1',
      cardId: jsnA.id,
    });
    // p2 has no further Just Say No but still gets the window; letting it go ends the chain at 2 → action proceeds
    expect(r.state.pendingStack[0]?.kind).toBe('just_say_no');
    r = dispatch(r.state, { type: 'DECLINE_JUST_SAY_NO', playerId: 'p2' });
    expect(r.state.pendingStack.some((p) => p.kind === 'payment')).toBe(true);
  });

  it('triple chain cancels again', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const dc = take(pool, (c) => c.kind === 'action' && c.action === 'debt_collector');
    const j1 = take(pool, (c) => c.kind === 'action' && c.action === 'just_say_no');
    const j2 = take(pool, (c) => c.kind === 'action' && c.action === 'just_say_no');
    const j3 = take(pool, (c) => c.kind === 'action' && c.action === 'just_say_no');
    const m = take(pool, (c) => c.kind === 'money' && c.value === 5);
    const p1: PlayerState = { id: 'p1', hand: [dc, j2], board: { bank: [], sets: [] } };
    const p2: PlayerState = { id: 'p2', hand: [j1, j3], board: { bank: [m], sets: [] } };
    let r = dispatch(makeState([p1, p2]), {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: dc.id,
      zone: 'discard',
    });
    r = dispatch(r.state, {
      type: 'SELECT_DEBT_COLLECTOR_PLAYER',
      playerId: 'p1',
      targetPlayerId: 'p2',
    });
    r = dispatch(r.state, { type: 'RESPOND_JUST_SAY_NO', playerId: 'p2', cardId: j1.id });
    r = dispatch(r.state, { type: 'RESPOND_JUST_SAY_NO', playerId: 'p1', cardId: j2.id });
    r = dispatch(r.state, { type: 'RESPOND_JUST_SAY_NO', playerId: 'p2', cardId: j3.id });
    expect(r.state.pendingStack.find((p) => p.kind === 'payment')).toBeUndefined();
    expect(r.state.players[1]!.board.bank).toHaveLength(1);
  });

  it('JSN against sly deal', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const sly = take(pool, (c) => c.kind === 'action' && c.action === 'sly_deal');
    const jsn = take(pool, (c) => c.kind === 'action' && c.action === 'just_say_no');
    const red = take(pool, (c) => c.kind === 'property' && c.color === 'red');
    const p1: PlayerState = { id: 'p1', hand: [sly], board: { bank: [], sets: [] } };
    const p2: PlayerState = {
      id: 'p2',
      hand: [jsn],
      board: { bank: [], sets: [setOf('red', [red])] },
    };
    let r = dispatch(makeState([p1, p2]), {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: sly.id,
      zone: 'discard',
    });
    r = dispatch(r.state, {
      type: 'SELECT_STEAL_TARGET',
      playerId: 'p1',
      targetCardId: red.id,
    });
    r = dispatch(r.state, {
      type: 'RESPOND_JUST_SAY_NO',
      playerId: 'p2',
      cardId: jsn.id,
    });
    expect(r.state.players[1]!.board.sets[0]!.cards[0]!.id).toBe(red.id);
  });
});

describe('Payment rules', () => {
  it('pays with property when bank empty', () => {
    const state = fixtures.rentWithEmptyBank();
    const cardIds = state.players[1]!.board.sets[0]!.cards.map((c) => c.id);
    const r = dispatch(state, {
      type: 'SELECT_PAYMENT',
      playerId: 'p2',
      cardIds,
    });
    expect(r.rejected).toBeUndefined();
    expect(r.state.pendingStack.filter((p) => p.kind === 'payment')).toHaveLength(0);
    expect(r.state.players[0]!.board.sets.some((s) => s.color === 'pink')).toBe(true);
  });

  it('breaking a completed set sends its house to the bank when no other set can take it', () => {
    const state = fixtures.payBreaksCompletedSet();
    // Pay with one green property (value 4) + money 1 = 5
    const green = state.players[1]!.board.sets[0]!.cards[0]!;
    const money = state.players[1]!.board.bank[0]!;
    const r = dispatch(state, {
      type: 'SELECT_PAYMENT',
      playerId: 'p2',
      cardIds: [green.id, money.id],
    });
    expect(r.rejected).toBeUndefined();
    expect(r.events.some((e) => e.type === 'set_broken')).toBe(true);
    const payer = r.state.players[1]!;
    // No empty set is left holding it: the house is cash now.
    expect(payer.board.sets.every((s) => s.cards.length > 0)).toBe(true);
    expect(payer.board.sets.some((s) => s.house)).toBe(false);
    expect(payer.board.bank.map((c) => c.id)).toEqual(['gh1']);
  });

  it('a loose house and hotel move onto the best other complete set that can take them', () => {
    const state = fixtures.payBreaksCompletedSet();
    const payer = state.players[1]!;
    payer.board.sets[0]!.hotel = { id: 'gt1', kind: 'action', action: 'hotel', value: 4 };
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const brown = [0, 1].map(() => take(pool, (c) => c.kind === 'property' && c.color === 'brown'));
    const blue = [0, 1].map(() => take(pool, (c) => c.kind === 'property' && c.color === 'dark_blue'));
    const rail = [0, 1, 2, 3].map(() => take(pool, (c) => c.kind === 'property' && c.color === 'railroad'));
    payer.board.sets.push(setOf('brown', brown), setOf('dark_blue', blue), setOf('railroad', rail));

    const green = payer.board.sets[0]!.cards[0]!;
    const r = dispatch(state, { type: 'SELECT_PAYMENT', playerId: 'p2', cardIds: [green.id, 'tiny'] });
    expect(r.rejected).toBeUndefined();
    const after = r.state.players[1]!.board;
    // Dark blue out-rents brown; a railroad never takes a building.
    const darkBlue = after.sets.find((s) => s.color === 'dark_blue')!;
    expect(darkBlue.house?.id).toBe('gh1');
    expect(darkBlue.hotel?.id).toBe('gt1');
    expect(after.sets.every((s) => s.cards.length > 0)).toBe(true);
    expect(after.bank).toEqual([]);
  });

  it('a house picked in the same payment as the card that broke its set is still paid over', () => {
    const state = fixtures.payBreaksCompletedSet();
    const green = state.players[1]!.board.sets[0]!.cards[0]!;
    const r = dispatch(state, { type: 'SELECT_PAYMENT', playerId: 'p2', cardIds: [green.id, 'gh1'] });
    expect(r.rejected).toBeUndefined();
    expect(r.state.players[0]!.board.bank.map((c) => c.id)).toContain('gh1');
    expect(r.state.players[1]!.board.bank.map((c) => c.id)).toEqual(['tiny']);
  });

  it('overpayment gives no change', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const m5 = take(pool, (c) => c.kind === 'money' && c.value === 5);
    const m1 = take(pool, (c) => c.kind === 'money' && c.value === 1);
    const p1: PlayerState = { id: 'p1', hand: [], board: { bank: [], sets: [] } };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [m5, m1], sets: [] } };
    const state = makeState([p1, p2], {
      pendingStack: [
        { kind: 'payment', payerId: 'p2', payeeId: 'p1', amountDue: 3, reason: 'rent' },
      ],
    });
    const r = dispatch(state, {
      type: 'SELECT_PAYMENT',
      playerId: 'p2',
      cardIds: [m5.id],
    });
    expect(r.rejected).toBeUndefined();
    expect(r.state.players[0]!.board.bank.map((c) => c.id)).toEqual([m5.id]);
    expect(r.state.players[1]!.board.bank.map((c) => c.id)).toEqual([m1.id]);
  });

  it('insufficient assets pays everything', () => {
    const state = fixtures.insufficientPayment();
    const r = dispatch(state, {
      type: 'SELECT_PAYMENT',
      playerId: 'p2',
      cardIds: [state.players[1]!.board.bank[0]!.id],
    });
    expect(r.rejected).toBeUndefined();
    expect(r.state.players[1]!.board.bank).toHaveLength(0);
    expect(r.state.players[0]!.board.bank).toHaveLength(1);
  });

  it('rejects multicolor wild as payment', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const multi = take<import('@monopoly-deal/shared').PropertyWildCard>(
      pool,
      (c) => c.kind === 'property_wild' && c.colors.length === 0,
    );
    multi.assignedColor = 'red';
    const p1: PlayerState = { id: 'p1', hand: [], board: { bank: [], sets: [] } };
    const p2: PlayerState = {
      id: 'p2',
      hand: [],
      board: { bank: [], sets: [setOf('red', [multi])] },
    };
    const state = makeState([p1, p2], {
      pendingStack: [
        { kind: 'payment', payerId: 'p2', payeeId: 'p1', amountDue: 1, reason: 'rent' },
      ],
    });
    const r = dispatch(state, {
      type: 'SELECT_PAYMENT',
      playerId: 'p2',
      cardIds: [multi.id],
    });
    expect(r.rejected).toBeTruthy();
  });
});

describe('Wildcard overflow', () => {
  it('creates a new set when exceeding set size', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    // dark blue size 2 — place 2 props + wild as third via place
    const db1 = take(pool, (c) => c.kind === 'property' && c.color === 'dark_blue');
    const db2 = take(pool, (c) => c.kind === 'property' && c.color === 'dark_blue');
    const wild = take(
      pool,
      (c) => c.kind === 'property_wild' && c.colors.includes('dark_blue'),
    );
    const p1: PlayerState = {
      id: 'p1',
      hand: [wild],
      board: { bank: [], sets: [setOf('dark_blue', [db1, db2])] },
    };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [] } };
    const r = dispatch(makeState([p1, p2]), {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: wild.id,
      zone: 'property',
      target: { assignedColor: 'dark_blue' },
    });
    expect(r.rejected).toBeUndefined();
    const dbSets = r.state.players[0]!.board.sets.filter((s) => s.color === 'dark_blue');
    expect(dbSets.length).toBe(2);
    expect(dbSets.every((s) => s.cards.length <= SET_SIZES.dark_blue)).toBe(true);
  });
});

describe('Hand limit', () => {
  it('discard excess is not a play and advances turn', () => {
    const state = fixtures.overHandLimit();
    const plays = state.playsRemaining;
    const ids = state.players[0]!.hand.slice(0, 2).map((c) => c.id);
    const r = dispatch(state, { type: 'DISCARD_EXCESS', playerId: 'p1', cardIds: ids });
    expect(r.rejected).toBeUndefined();
    expect(r.state.players[0]!.hand.length).toBe(7);
    expect(r.state.currentPlayerIndex).toBe(1);
    // playsRemaining reset for next player, not decremented by discard
    expect(r.state.playsRemaining).toBe(MAX_PLAYS);
    expect(plays).toBe(MAX_PLAYS);
  });

  it('resume play cancels a pending discard while plays remain', () => {
    const state = fixtures.overHandLimit();
    expect(state.playsRemaining).toBeGreaterThan(0);
    const r = dispatch(state, { type: 'RESUME_PLAY', playerId: 'p1' });
    expect(r.rejected).toBeUndefined();
    expect(r.state.turnPhase).toBe('playing');
    expect(r.state.pendingStack.length).toBe(0);
    expect(r.state.currentPlayerIndex).toBe(0);
    expect(r.state.playsRemaining).toBe(state.playsRemaining);
    expect(r.state.players[0]!.hand.length).toBe(9);
  });

  it('resume play is rejected once plays are exhausted', () => {
    const state = fixtures.overHandLimit();
    state.playsRemaining = 0;
    const r = dispatch(state, { type: 'RESUME_PLAY', playerId: 'p1' });
    expect(r.rejected).toBeDefined();
    expect(r.state.pendingStack.length).toBe(1);
  });
});

describe('Empty hand draw 5', () => {
  it('fixture emptyHand draws 5', () => {
    const state = fixtures.emptyHand();
    const r = dispatch(state, { type: 'DRAW_TURN_CARDS', playerId: 'p1' });
    expect(r.rejected).toBeUndefined();
    expect(r.state.players[0]!.hand.length).toBe(5);
  });
});

describe('Win detection', () => {
  it('wins when third set completed by property play', () => {
    const state = fixtures.oneSetFromWinning();
    const card = state.players[0]!.hand[0]!;
    const r = dispatch(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: card.id,
      zone: 'property',
    });
    expect(r.state.winnerId).toBe('p1');
  });
});

describe('Wildcard placement', () => {
  // A wildcard is legal in any of its printed colors regardless of what the
  // player already owns — the colors on the card are the only constraint. The
  // card starts a fresh set that later properties can join.
  it('playing a wild into a color you own no properties of creates a new set', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const wild = take<import('@monopoly-deal/shared').PropertyWildCard>(
      pool,
      (c) => c.kind === 'property_wild' && c.colors.includes('red') && c.colors.includes('yellow'),
    );
    const red = take(pool, (c) => c.kind === 'property' && c.color === 'red');
    const p1: PlayerState = { id: 'p1', hand: [wild, red], board: { bank: [], sets: [] } };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [] } };

    const played = dispatch(makeState([p1, p2]), {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: wild.id,
      zone: 'property',
      target: { assignedColor: 'red' },
    });
    expect(played.rejected).toBeUndefined();
    const redSets = played.state.players[0]!.board.sets.filter((s) => s.color === 'red');
    expect(redSets).toHaveLength(1);
    expect(redSets[0]!.cards).toHaveLength(1);

    // ...and a natural red joins that same set afterwards rather than starting another.
    const grown = dispatch(played.state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: red.id,
      zone: 'property',
    });
    expect(grown.rejected).toBeUndefined();
    const grownRed = grown.state.players[0]!.board.sets.filter((s) => s.color === 'red');
    expect(grownRed).toHaveLength(1);
    expect(grownRed[0]!.cards).toHaveLength(2);
  });

  it('offers every printed color as a legal play with an empty board', () => {
    const pool = buildDeck().filter((c) => c.kind !== 'rule');
    const wild = take<import('@monopoly-deal/shared').PropertyWildCard>(
      pool,
      (c) => c.kind === 'property_wild' && c.colors.includes('red') && c.colors.includes('yellow'),
    );
    const p1: PlayerState = { id: 'p1', hand: [wild], board: { bank: [], sets: [] } };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [] } };
    const colors = getLegalCommands(makeState([p1, p2]))
      .filter((c) => c.type === 'PLAY_CARD' && c.cardId === wild.id && c.zone === 'property')
      .map((c) => (c as Extract<Command, { type: 'PLAY_CARD' }>).target?.assignedColor);
    expect(colors).toEqual(expect.arrayContaining(['red', 'yellow']));
  });

  // Next to a complete set, a wild may start a second set of that colour (it keeps
  // the complete one whole against a Deal Breaker); but with a set of that colour
  // already under way it always joins it, so no player holds two incomplete sets of one colour.
  describe('a second set of one colour', () => {
    const board = () => {
      const pool = buildDeck().filter((c) => c.kind !== 'rule');
      const wild = take<import('@monopoly-deal/shared').PropertyWildCard>(
        pool,
        (c) => c.kind === 'property_wild' && c.colors.includes('red') && c.colors.includes('yellow'),
      );
      const reds = [0, 1, 2].map(() => take(pool, (c) => c.kind === 'property' && c.color === 'red'));
      const yellow = take(pool, (c) => c.kind === 'property' && c.color === 'yellow');
      const other = take<import('@monopoly-deal/shared').PropertyWildCard>(
        pool,
        (c) => c.kind === 'property_wild' && c.colors.includes('red') && c.colors.includes('yellow'),
      );
      return { wild, reds, yellow, other };
    };
    const playWild = (state: GameState, cardId: string, assignedColor: PropertyColor, setId?: string) =>
      dispatch(state, { type: 'PLAY_CARD', playerId: 'p1', cardId, zone: 'property', target: { assignedColor, setId } });
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [] } };

    it('starts beside a complete set, even with another colour of the wild under way', () => {
      const { wild, reds, yellow } = board();
      const done = setOf('red', reds);
      const p1: PlayerState = { id: 'p1', hand: [wild], board: { bank: [], sets: [done, setOf('yellow', [yellow])] } };

      const res = playWild(makeState([p1, p2]), wild.id, 'red');
      expect(res.rejected).toBeUndefined();
      const red = res.state.players[0]!.board.sets.filter((s) => s.color === 'red');
      expect(red.map((s) => s.cards.length)).toEqual([3, 1]);
      expect(red[0]!.id).toBe(done.id);
      expect(res.state.players[0]!.board.sets.find((s) => s.color === 'yellow')!.cards).toHaveLength(1);
    });

    it('joins the set under way rather than open a second incomplete one, even when a full set is named', () => {
      const { wild, reds, other } = board();
      const done = setOf('red', reds);
      other.assignedColor = 'red';
      const started = setOf('red', [other]);
      const p1: PlayerState = { id: 'p1', hand: [wild], board: { bank: [], sets: [done, started] } };

      const res = playWild(makeState([p1, p2]), wild.id, 'red', done.id);
      expect(res.rejected).toBeUndefined();
      const red = res.state.players[0]!.board.sets.filter((s) => s.color === 'red');
      expect(red.map((s) => s.cards.length)).toEqual([3, 2]);
      expect(red[1]!.id).toBe(started.id);
    });
  });

  // The ten-colour Joker is the exception: it only joins a set already under
  // way and never opens one.
  describe('Joker (ten-colour wild)', () => {
    const jokerAndRed = () => {
      const pool = buildDeck().filter((c) => c.kind !== 'rule');
      const joker = take<import('@monopoly-deal/shared').PropertyWildCard>(
        pool,
        (c) => c.kind === 'property_wild' && c.colors.length === 0,
      );
      const red = take(pool, (c) => c.kind === 'property' && c.color === 'red');
      const red2 = take(pool, (c) => c.kind === 'property' && c.color === 'red');
      return { joker, red, red2, pool };
    };
    const playJoker = (state: GameState, cardId: string, assignedColor: PropertyColor) =>
      dispatch(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId,
        zone: 'property',
        target: { assignedColor },
      });

    it('cannot start a set on an empty board', () => {
      const { joker } = jokerAndRed();
      const p1: PlayerState = { id: 'p1', hand: [joker], board: { bank: [], sets: [] } };
      const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [] } };
      const state = makeState([p1, p2]);

      const res = playJoker(state, joker.id, 'red');
      expect(res.rejected).toBeDefined();
      expect(res.state.players[0]!.hand).toHaveLength(1);
      expect(res.state.players[0]!.board.sets).toHaveLength(0);
      expect(
        getLegalCommands(state).filter((c) => c.type === 'PLAY_CARD' && c.cardId === joker.id),
      ).toEqual([]);
    });

    it('cannot start a colour the player has no set in, even with other sets down', () => {
      const { joker, red } = jokerAndRed();
      const p1: PlayerState = {
        id: 'p1',
        hand: [joker],
        board: { bank: [], sets: [setOf('red', [red])] },
      };
      const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [] } };
      const res = playJoker(makeState([p1, p2]), joker.id, 'green');
      expect(res.rejected).toBeDefined();
      expect(res.state.players[0]!.board.sets).toHaveLength(1);
    });

    it('joins an incomplete set that already holds a card', () => {
      const { joker, red } = jokerAndRed();
      const p1: PlayerState = {
        id: 'p1',
        hand: [joker],
        board: { bank: [], sets: [setOf('red', [red])] },
      };
      const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [] } };
      const state = makeState([p1, p2]);

      const res = playJoker(state, joker.id, 'red');
      expect(res.rejected).toBeUndefined();
      const sets = res.state.players[0]!.board.sets;
      expect(sets).toHaveLength(1);
      expect(sets[0]!.cards).toHaveLength(2);

      const offered = getLegalCommands(state)
        .filter((c) => c.type === 'PLAY_CARD' && c.cardId === joker.id)
        .map((c) => (c as Extract<Command, { type: 'PLAY_CARD' }>).target?.assignedColor);
      expect(offered).toEqual(['red']);
    });

    it('cannot join a complete set', () => {
      const { joker } = jokerAndRed();
      const pool = buildDeck().filter((c) => c.kind !== 'rule');
      const db = take(pool, (c) => c.kind === 'property' && c.color === 'dark_blue');
      const db2 = take(pool, (c) => c.kind === 'property' && c.color === 'dark_blue');
      const p1: PlayerState = {
        id: 'p1',
        hand: [joker],
        board: { bank: [], sets: [setOf('dark_blue', [db, db2])] },
      };
      const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [] } };
      const res = playJoker(makeState([p1, p2]), joker.id, 'dark_blue');
      expect(res.rejected).toBeDefined();
    });

    it('cannot be moved onto a colour with no set under way', () => {
      const { joker, red } = jokerAndRed();
      joker.assignedColor = 'red';
      const p1: PlayerState = {
        id: 'p1',
        hand: [],
        board: { bank: [], sets: [setOf('red', [red, joker])] },
      };
      const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [] } };
      const state = makeState([p1, p2]);
      state.turnPhase = 'playing';

      const res = dispatch(state, {
        type: 'REARRANGE_PROPERTY',
        playerId: 'p1',
        cardId: joker.id,
        toColor: 'green',
      });
      expect(res.rejected).toBeDefined();
      expect(res.state.players[0]!.board.sets).toHaveLength(1);
      expect(
        getLegalRearranges(state, 'p1').filter((c) => c.type === 'REARRANGE_PROPERTY' && c.cardId === joker.id),
      ).toEqual([]);
    });

    it('can be moved onto another set already under way', () => {
      const { joker, red, red2, pool } = jokerAndRed();
      const green = take(pool, (c) => c.kind === 'property' && c.color === 'green');
      joker.assignedColor = 'red';
      const p1: PlayerState = {
        id: 'p1',
        hand: [],
        board: { bank: [], sets: [setOf('red', [red, red2, joker]), setOf('green', [green])] },
      };
      const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [] } };
      const state = makeState([p1, p2]);
      state.turnPhase = 'playing';

      const res = dispatch(state, {
        type: 'REARRANGE_PROPERTY',
        playerId: 'p1',
        cardId: joker.id,
        toColor: 'green',
      });
      expect(res.rejected).toBeUndefined();
      expect(res.state.players[0]!.board.sets.find((s) => s.color === 'green')!.cards).toHaveLength(2);
    });

    it('leaves the two-colour wilds free to start a set', () => {
      const pool = buildDeck().filter((c) => c.kind !== 'rule');
      const wild = take<import('@monopoly-deal/shared').PropertyWildCard>(
        pool,
        (c) => c.kind === 'property_wild' && c.colors.includes('red') && c.colors.includes('yellow'),
      );
      const p1: PlayerState = { id: 'p1', hand: [wild], board: { bank: [], sets: [] } };
      const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [] } };
      expect(playJoker(makeState([p1, p2]), wild.id, 'red').rejected).toBeUndefined();
    });
  });
});

describe('removalCost', () => {
  const pool = () => buildDeck().filter((c) => c.kind !== 'rule');

  it('reports no cost for pulling a card out of an incomplete set', () => {
    const p = pool();
    const wild = take(p, (c) => c.kind === 'property_wild' && c.colors.includes('red'));
    const red = take(p, (c) => c.kind === 'property' && c.color === 'red');
    const board = { bank: [], sets: [setOf('red', [red, wild])] };
    expect(removalCost(board, wild.id)).toEqual({
      breaksCompleteSet: false,
      orphansBuilding: false,
    });
  });

  it('flags a break when the card completes the set', () => {
    const p = pool();
    const db = take(p, (c) => c.kind === 'property' && c.color === 'dark_blue');
    const wild = take(p, (c) => c.kind === 'property_wild' && c.colors.includes('dark_blue'));
    // dark_blue is a 2-card set, so these two make it complete.
    const board = { bank: [], sets: [setOf('dark_blue', [db, wild])] };
    expect(removalCost(board, wild.id)).toEqual({
      breaksCompleteSet: true,
      orphansBuilding: false,
    });
  });

  it('flags an orphaned building when the break sheds a house', () => {
    const p = pool();
    const db = take(p, (c) => c.kind === 'property' && c.color === 'dark_blue');
    const wild = take(p, (c) => c.kind === 'property_wild' && c.colors.includes('dark_blue'));
    const house = take(p, (c) => c.kind === 'action' && c.action === 'house');
    const board = { bank: [], sets: [setOf('dark_blue', [db, wild], { house })] };
    expect(removalCost(board, wild.id)).toEqual({
      breaksCompleteSet: true,
      orphansBuilding: true,
    });
  });

  it('flags an orphaned building when removing the set’s last property', () => {
    const p = pool();
    const wild = take(p, (c) => c.kind === 'property_wild' && c.colors.includes('red'));
    const house = take(p, (c) => c.kind === 'action' && c.action === 'house');
    const board = { bank: [], sets: [setOf('red', [wild], { house })] };
    expect(removalCost(board, wild.id)).toEqual({
      breaksCompleteSet: false,
      orphansBuilding: true,
    });
  });

  it('treats the multicolor wild the same as any other board property', () => {
    const p = pool();
    const multi = take(p, (c) => c.kind === 'property_wild' && c.colors.length === 0);
    const db = take(p, (c) => c.kind === 'property' && c.color === 'dark_blue');
    const board = { bank: [], sets: [setOf('dark_blue', [db, multi])] };
    expect(removalCost(board, multi.id)?.breaksCompleteSet).toBe(true);
  });

  it('returns null for a card that is not on the board', () => {
    expect(removalCost({ bank: [], sets: [] }, 'nope')).toBeNull();
  });

  it('agrees with what dispatch actually does on a rearrange', () => {
    const p = pool();
    const db = take(p, (c) => c.kind === 'property' && c.color === 'dark_blue');
    const wild = take<import('@monopoly-deal/shared').PropertyWildCard>(
      p,
      (c) =>
        c.kind === 'property_wild' &&
        c.colors.includes('dark_blue') &&
        c.colors.includes('green'),
    );
    wild.assignedColor = 'dark_blue';
    const p1: PlayerState = {
      id: 'p1',
      hand: [],
      board: { bank: [], sets: [setOf('dark_blue', [db, wild])] },
    };
    const p2: PlayerState = { id: 'p2', hand: [], board: { bank: [], sets: [] } };
    const state = makeState([p1, p2]);
    const predicted = removalCost(p1.board, wild.id);

    const r = dispatch(state, {
      type: 'REARRANGE_PROPERTY',
      playerId: 'p1',
      cardId: wild.id,
      toColor: 'green',
    });
    expect(r.rejected).toBeUndefined();
    expect(predicted?.breaksCompleteSet).toBe(true);
    expect(r.events.some((e) => e.type === 'set_broken')).toBe(true);
  });
});

describe('createGame + legal moves smoke', () => {
  it('can play a full short turn', () => {
    let { state } = createGame(['a', 'b', 'c', 'd'], 42);
    expect(getLegalCommands(state)[0]?.type).toBe('DRAW_TURN_CARDS');
    state = dispatch(state, { type: 'DRAW_TURN_CARDS', playerId: 'a' }).state;
    const legal = getLegalCommands(state);
    expect(legal.some((c) => c.type === 'END_TURN')).toBe(true);
  });
});
