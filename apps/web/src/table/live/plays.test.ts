import { describe, expect, it } from 'vitest';
import { fixtures } from '@monopoly-deal/engine';
import type { Command, GameState, PlayTarget, PlayZone } from '@monopoly-deal/shared';
import { buildConfirm, heldStillValid, planPlay, planRearrange, wastedPlayCopy, type ConfirmIO, type Held } from './plays';
import { actionCard, playDeps, view, withHand } from './testkit';

const plan = (state: GameState, viewer: string, cardId: string, zone: 'bank' | 'build' | 'play', color?: Parameters<typeof planPlay>[4]) => {
  const client = view(state, viewer);
  return planPlay(client, playDeps(client), cardId, zone, color);
};
const rearrange = (state: GameState, viewer: string, cardId: string, toColor: Parameters<typeof planRearrange>[3]) => {
  const client = view(state, viewer);
  return planRearrange(client, playDeps(client), cardId, toColor);
};

describe('planPlay — banking', () => {
  const state = fixtures.responsiveMidGame();

  it('money banks at once', () => {
    expect(plan(state, 'p1', 'm1', 'bank')).toEqual({ kind: 'send', zone: 'bank', target: undefined });
  });

  it('an action card dropped on the bank asks bank / play / keep', () => {
    expect(plan(state, 'p1', 'pg1', 'bank')).toMatchObject({ kind: 'hold', held: { kind: 'bank_action', cardId: 'pg1', canPlay: true } });
  });

  it('Just Say No can only be banked, so the prompt does not offer to play it', () => {
    const jsn = withHand(state, 'p1', [actionCard('jsn9', 'just_say_no', 4)]);
    expect(plan(jsn, 'p1', 'jsn9', 'bank')).toMatchObject({ kind: 'hold', held: { kind: 'bank_action', canPlay: false } });
  });

  it('a house or hotel dropped on the bank asks cash or building', () => {
    const house = withHand(state, 'p1', [actionCard('hz1', 'house', 3), actionCard('ht9', 'hotel', 4)]);
    expect(plan(house, 'p1', 'hz1', 'bank')).toMatchObject({ kind: 'hold', held: { kind: 'building_choice', cardId: 'hz1' } });
    expect(plan(house, 'p1', 'ht9', 'bank')).toMatchObject({ kind: 'hold', held: { kind: 'building_choice', cardId: 'ht9' } });
  });

  it('properties cannot be banked', () => {
    expect(plan(state, 'p1', 'pr1', 'bank')).toEqual({ kind: 'reject', message: 'Cannot bank this card here' });
  });
});

describe('planPlay — building properties', () => {
  const state = fixtures.wildcardUsage();

  it('a plain property builds with no colour needed', () => {
    const start = fixtures.responsiveMidGame();
    expect(plan(start, 'p1', 'pr1', 'build')).toEqual({ kind: 'send', zone: 'property', target: undefined });
  });

  it('a wild builds into the colour picked', () => {
    expect(plan(state, 'p1', 'wc_dual', 'build', 'pink')).toEqual({ kind: 'send', zone: 'property', target: { assignedColor: 'pink' } });
  });

  it('a wild cannot go to a colour it does not have; the multicolour one can go anywhere', () => {
    expect(plan(state, 'p1', 'wc_dual', 'build', 'red')).toEqual({ kind: 'reject', message: 'Wild cannot be that color' });
    expect(plan(state, 'p1', 'wc_multi', 'build', 'red')).toEqual({ kind: 'send', zone: 'property', target: { assignedColor: 'red' } });
  });

  it('a wild with no colour asked lets the store pick', () => {
    const client = view(state, 'p1');
    const picked: PlayTarget = { assignedColor: 'light_blue' };
    const deps = { ...playDeps(client), pickPlayCommand: (cardId: string, zone: PlayZone, target?: PlayTarget) => ({ cardId, zone, target: target ?? picked }) };
    expect(planPlay(client, deps, 'wc_dual', 'build')).toEqual({ kind: 'send', zone: 'property', target: picked });
  });

  it('money is not a property', () => {
    expect(plan(fixtures.responsiveMidGame(), 'p1', 'm1', 'build')).toEqual({ kind: 'reject', message: 'Cannot play this card as a property' });
  });
});

describe('planPlay — playing an action', () => {
  it('plays straight through when it does something', () => {
    expect(plan(fixtures.responsiveMidGame(), 'p1', 'pg1', 'play')).toEqual({ kind: 'send', zone: 'discard', target: undefined });
  });

  it('holds a play that would gain nothing, with the engine’s reason', () => {
    // p1 owns no red or yellow properties in play, so a red/yellow rent card charges nobody.
    const state = fixtures.standardMidGame();
    const result = plan(state, 'p1', 'r1', 'play');
    expect(result).toMatchObject({ kind: 'hold', held: { kind: 'wasted', cardId: 'r1', reason: { kind: 'rent_no_colors' } } });
  });

  it('a rent card with an unplayed Double the Rent in hand asks whether to double', () => {
    const state = fixtures.doubleRentCombo();
    expect(plan(state, 'p1', 'r1', 'play')).toMatchObject({ kind: 'hold', held: { kind: 'rent_double', cardId: 'r1', doubleId: 'dbl1' } });
  });

  it('asks even on the last play, since the Double costs none; not when one is already staged', () => {
    const lastPlay = { ...fixtures.doubleRentCombo(), playsRemaining: 1 };
    expect(plan(lastPlay, 'p1', 'r1', 'play')).toMatchObject({ kind: 'hold', held: { kind: 'rent_double' } });
    const staged = { ...fixtures.doubleRentCombo(), pendingDoubles: 1 };
    expect(plan(staged, 'p1', 'r1', 'play')).toMatchObject({ kind: 'send', zone: 'discard' });
  });

  it('money and properties cannot be played as actions', () => {
    const state = fixtures.responsiveMidGame();
    expect(plan(state, 'p1', 'm1', 'play')).toEqual({ kind: 'reject', message: 'Cannot play this card here' });
    expect(plan(state, 'p1', 'pr1', 'play')).toEqual({ kind: 'reject', message: 'Cannot play this card here' });
  });
});

describe('planPlay — when it is not yours to play', () => {
  it('waiting for your turn', () => {
    expect(plan(fixtures.responsiveMidGame(), 'p2', 'jsn1', 'bank')).toEqual({ kind: 'reject', message: 'Wait for your turn to play' });
  });

  it('draw first', () => {
    const state = fixtures.emptyHand();
    const hand = withHand(state, 'p1', [{ id: 'x1', kind: 'money', amount: 1, value: 1 }]);
    expect(plan(hand, 'p1', 'x1', 'bank')).toEqual({ kind: 'reject', message: 'Draw 2 cards before playing' });
  });

  it('a card that is not in your hand', () => {
    expect(plan(fixtures.responsiveMidGame(), 'p1', 'nope', 'bank')).toMatchObject({ kind: 'reject' });
  });

  it('during a hand-limit discard, dropping on the discard pile marks the card and everything else is refused', () => {
    const state = fixtures.overHandLimit();
    expect(plan(state, 'p1', 'oh0', 'play')).toEqual({ kind: 'toggle-discard', cardId: 'oh0' });
    expect(plan(state, 'p1', 'oh0', 'bank')).toEqual({ kind: 'reject', message: 'Use discard pile to drop excess cards' });
  });
});

describe('planRearrange', () => {
  /** p1 with a red wild in an unfinished red set, and an unfinished yellow set to flip into. */
  const flippable = (): GameState => {
    const state = structuredClone(fixtures.wildcardUsage());
    const red = state.players[0]!.board.sets[0]!;
    red.cards = red.cards.filter((c) => c.id !== 'rw2'); // rw1 + the wild: 2 of 3
    state.players[0]!.board.sets.push({ id: 'set_yellow', color: 'yellow', cards: [{ id: 'yy1', kind: 'property', color: 'yellow', value: 3, name: 'Y' }] });
    return state;
  };

  it('a flip that costs nothing goes straight out, joining the unfinished set of that colour', () => {
    expect(rearrange(flippable(), 'p1', 'rw_wild', 'yellow')).toEqual({ kind: 'send', toSetId: 'set_yellow' });
  });

  it('with no set of that colour yet, the engine starts one', () => {
    const state = structuredClone(flippable());
    state.players[0]!.board.sets = state.players[0]!.board.sets.filter((s) => s.id !== 'set_yellow');
    expect(rearrange(state, 'p1', 'rw_wild', 'yellow')).toEqual({ kind: 'send', toSetId: undefined });
  });

  it('a flip that would break a completed set asks first', () => {
    const result = rearrange(fixtures.wildcardUsage(), 'p1', 'rw_wild', 'yellow');
    expect(result).toMatchObject({ kind: 'hold', held: { kind: 'flip', cardId: 'rw_wild', toColor: 'yellow' } });
    expect(result.kind === 'hold' && result.held.kind === 'flip' && result.held.copy).toContain('breaks the set');
  });

  it('refuses what the rules refuse', () => {
    const state = fixtures.wildcardUsage();
    expect(rearrange(state, 'p1', 'rw1', 'yellow')).toEqual({ kind: 'reject', message: 'Natural property cannot change color' });
    expect(rearrange(state, 'p1', 'rw_wild', 'pink')).toEqual({ kind: 'reject', message: 'Wild cannot be that color' });
    expect(rearrange(state, 'p1', 'ghost', 'red')).toMatchObject({ kind: 'reject' });
    expect(rearrange(state, 'p2', 'rw_wild', 'red')).toMatchObject({ kind: 'reject' });
  });

  it('moving a card to the colour it already is does nothing', () => {
    expect(rearrange(fixtures.wildcardUsage(), 'p1', 'rw_wild', 'red')).toEqual({ kind: 'noop' });
  });
});

/** A recording stand-in for the store. */
function fakeIO(overrides: Partial<ConfirmIO> = {}) {
  const calls: string[] = [];
  const sent: Command[] = [];
  const dispatched: { type: string; payload?: Record<string, unknown> }[] = [];
  const io: ConfirmIO = {
    playCard: (cardId, zone, target) => calls.push(`play ${cardId} ${zone}${target ? ` ${JSON.stringify(target)}` : ''}`),
    dispatchCommand: async (type, payload) => {
      dispatched.push({ type, payload });
      return { ok: true };
    },
    pickPlayCommand: (cardId, zone, target) => ({ cardId, zone, target }),
    send: (command) => sent.push(command),
    rejectLocal: (message) => calls.push(`reject ${message}`),
    isCompleteSet: (set) => set.cards.length >= 3,
    clear: () => calls.push('clear'),
    ...overrides,
  };
  return { io, calls, sent, dispatched };
}

const held = (state: GameState, viewer: string, cardId: string, zone: 'bank' | 'build' | 'play'): Held => {
  const result = plan(state, viewer, cardId, zone);
  if (result.kind !== 'hold') throw new Error(`expected a hold, got ${result.kind}`);
  return result.held;
};

describe('buildConfirm', () => {
  it('wasted play: the copy is the engine reason worded, yes plays it, undo drops it', () => {
    const state = fixtures.standardMidGame();
    const client = view(state, 'p1');
    const h = held(state, 'p1', 'r1', 'play');
    const { io, calls } = fakeIO();
    const confirm = buildConfirm(h, client, io);
    if (confirm?.kind !== 'wasted') throw new Error('expected wasted');
    expect(confirm.card.id).toBe('r1');
    expect(confirm.copy).toBe(wastedPlayCopy({ kind: 'rent_no_colors' }));
    confirm.undo();
    expect(calls).toEqual(['clear']);
    confirm.yes();
    expect(calls).toEqual(['clear', 'play r1 discard', 'clear']);
  });

  it('action to bank: cash banks, play plays as an action, keep drops', () => {
    const state = fixtures.responsiveMidGame();
    const client = view(state, 'p1');
    const h = held(state, 'p1', 'pg1', 'bank');
    const a = fakeIO();
    const confirm = buildConfirm(h, client, a.io);
    if (confirm?.kind !== 'bank_action') throw new Error('expected bank_action');
    expect(confirm.canPlay).toBe(true);
    confirm.cash();
    confirm.play();
    confirm.keep();
    expect(a.calls).toEqual(['play pg1 bank', 'clear', 'play pg1 discard', 'clear', 'clear']);
  });

  it('action to bank: if the store cannot pick a play command, it says so', () => {
    const state = fixtures.responsiveMidGame();
    const h = held(state, 'p1', 'pg1', 'bank');
    const a = fakeIO({ pickPlayCommand: () => undefined });
    const confirm = buildConfirm(h, view(state, 'p1'), a.io);
    if (confirm?.kind !== 'bank_action') throw new Error('expected bank_action');
    confirm.play();
    expect(a.calls).toEqual(['reject Cannot play this card right now', 'clear']);
  });

  it('house to bank: build is offered only when a complete set can take it', () => {
    const base = withHand(fixtures.standardMidGame(), 'p1', [actionCard('hz1', 'house', 3)]);
    const canBuild = buildConfirm(held(base, 'p1', 'hz1', 'bank'), view(base, 'p1'), fakeIO().io);
    expect(canBuild).toMatchObject({ kind: 'building_choice', canBuild: true }); // light blue is complete

    const noSet = withHand(fixtures.responsiveMidGame(), 'p1', [actionCard('hz1', 'house', 3)]);
    const cannot = buildConfirm(held(noSet, 'p1', 'hz1', 'bank'), view(noSet, 'p1'), fakeIO().io);
    expect(cannot).toMatchObject({ kind: 'building_choice', canBuild: false });
  });

  it('house to bank: build plays it as an action', () => {
    const state = withHand(fixtures.standardMidGame(), 'p1', [actionCard('hz1', 'house', 3)]);
    const a = fakeIO();
    const confirm = buildConfirm(held(state, 'p1', 'hz1', 'bank'), view(state, 'p1'), a.io);
    if (confirm?.kind !== 'building_choice') throw new Error('expected building_choice');
    confirm.build();
    expect(a.calls).toEqual(['play hz1 discard', 'clear']);
  });

  it('rent + Double: twice sends the Double first and the rent second; plain sends only the rent', async () => {
    const state = fixtures.doubleRentCombo();
    const client = view(state, 'p1');
    const h = held(state, 'p1', 'r1', 'play');
    const twice = fakeIO();
    const confirm = buildConfirm(h, client, twice.io);
    if (confirm?.kind !== 'rent_double') throw new Error('expected rent_double');
    expect(confirm.card.id).toBe('r1');
    expect(confirm.double.id).toBe('dbl1');
    confirm.twice();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(twice.dispatched.map((d) => (d.payload as { cardId: string }).cardId)).toEqual(['dbl1', 'r1']);
    expect(twice.dispatched.every((d) => d.type === 'PLAY_CARD')).toBe(true);
    expect(twice.calls).toEqual(['clear']);

    const plain = fakeIO();
    const other = buildConfirm(h, client, plain.io);
    if (other?.kind !== 'rent_double') throw new Error('expected rent_double');
    other.plain();
    expect(plain.calls).toEqual(['play r1 discard', 'clear']);
    expect(plain.dispatched).toEqual([]);
  });

  it('rent + Double: a refused Double stops the chain and says why', async () => {
    const state = fixtures.doubleRentCombo();
    const h = held(state, 'p1', 'r1', 'play');
    const a = fakeIO({
      dispatchCommand: async (type, payload) => {
        a.dispatched.push({ type, payload });
        return { ok: false, reason: 'Nope' };
      },
    });
    const confirm = buildConfirm(h, view(state, 'p1'), a.io);
    if (confirm?.kind !== 'rent_double') throw new Error('expected rent_double');
    confirm.twice();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(a.dispatched).toHaveLength(1);
    expect(a.calls).toEqual(['clear', 'reject Nope']);
  });
});

describe('confirm validity', () => {
  it('a held play dies with its card, its turn, or its Double', () => {
    const state = fixtures.doubleRentCombo();
    const h = held(state, 'p1', 'r1', 'play');
    expect(heldStillValid(h, view(state, 'p1'))).toBe(true);

    const played = structuredClone(state);
    played.players[0]!.hand = played.players[0]!.hand.filter((c) => c.id !== 'dbl1');
    expect(heldStillValid(h, view(played, 'p1'))).toBe(false);
    expect(buildConfirm(h, view(played, 'p1'), fakeIO().io)).toBeNull();

    const turnOver = { ...state, currentPlayerIndex: 1 };
    expect(heldStillValid(h, view(turnOver, 'p1'))).toBe(false);
  });

  it('a held flip dies when the wild leaves the table or the turn ends', () => {
    const state = fixtures.wildcardUsage();
    const result = rearrange(state, 'p1', 'rw_wild', 'yellow');
    if (result.kind !== 'hold') throw new Error('expected a hold');
    expect(heldStillValid(result.held, view(state, 'p1'))).toBe(true);
    expect(heldStillValid(result.held, view({ ...state, currentPlayerIndex: 1 }, 'p1'))).toBe(false);

    const a = fakeIO();
    const confirm = buildConfirm(result.held, view(state, 'p1'), a.io);
    if (confirm?.kind !== 'flip') throw new Error('expected flip');
    expect(confirm.card.id).toBe('rw_wild');
    expect(confirm.toColor).toBe('yellow');
    confirm.yes();
    expect(a.sent).toEqual([{ type: 'REARRANGE_PROPERTY', playerId: 'p1', cardId: 'rw_wild', toColor: 'yellow', toSetId: undefined }]);
    expect(a.calls).toEqual(['clear']);
  });
});
