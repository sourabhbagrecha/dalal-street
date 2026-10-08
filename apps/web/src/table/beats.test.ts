import { describe, expect, it } from 'vitest';
import { dispatch, fixtures, project } from '@monopoly-deal/engine';
import type { Card, ClientGameState, Command, GameEvent, GameState } from '@monopoly-deal/shared';
import type { LogEntry } from '../store/types';
import { theme } from '../theme';
import { QUEUE_CAP, WAIT_CAP, drain, flush, ingest, initialLive, release, sceneMs } from './beats';
import type { Beat, Fx } from './model';
import { cardName, stateName } from './model';

const NAMES: Record<string, string> = { p1: 'Aarav', p2: 'Priya', p3: 'Marcus', p4: 'Yuki' };
const money = theme.formatMoney;

interface Round {
  beats: Beat[];
  waits: number[];
  fx: Fx | null;
  /** "who text" per new feed line, in order. */
  feed: string[];
  tones: string[];
}

/**
 * A viewer's screen fed the way the network store feeds it: each command's events land in the log first, the
 * projection holding their result follows.
 */
class Table {
  live = initialLive();
  log: LogEntry[] = [];
  seq = 0;
  cs: ClientGameState;
  private fedTo = 0;
  private fxTo = 0;

  constructor(
    public state: GameState,
    public viewer: string,
    prelog: GameEvent[] = [],
  ) {
    this.log = prelog.map((e) => ({ ...e, id: ++this.seq, at: '' }));
    this.cs = this.view();
    this.live = ingest(this.live, this.log, this.cs);
  }

  view(): ClientGameState {
    return project(this.state, this.viewer, { displayNames: NAMES });
  }

  /** One server round trip; returns the entries it logged. */
  private send(cmd: Command): LogEntry[] {
    const r = dispatch(this.state, cmd);
    if (r.rejected) throw new Error(`rejected ${cmd.type}: ${r.rejected}`);
    this.state = r.state;
    return r.events.filter((e) => e.type !== 'rejected').map((e) => ({ ...e, id: ++this.seq, at: '' }));
  }

  /** The events reach the screen; the projection has not yet. */
  private events(entries: LogEntry[]) {
    this.log = [...this.log, ...entries];
    this.live = ingest(this.live, this.log, this.cs);
  }

  private projection() {
    this.cs = this.view();
    this.live = ingest(this.live, this.log, this.cs);
  }

  /** Everything staged so far, letting each scene run its time. */
  collect(): Round {
    const { state, beats, waits } = drain(this.live);
    this.live = state;
    const fresh = state.feed.filter((f) => f.id > this.fedTo);
    this.fedTo = state.seq;
    const fx = state.fx && state.fx.id > this.fxTo ? state.fx : null;
    this.fxTo = state.seq;
    return { beats, waits, fx, feed: fresh.map((f) => `${f.who} ${f.text}`.trim()), tones: fresh.map((f) => f.tone) };
  }

  /** Commands one at a time, each shown before the next arrives. */
  play(...cmds: Command[]): Round {
    const all: Round = { beats: [], waits: [], fx: null, feed: [], tones: [] };
    for (const cmd of cmds) {
      const entries = this.send(cmd);
      this.events(entries);
      this.projection();
      const r = this.collect();
      all.beats.push(...r.beats);
      all.waits.push(...r.waits);
      all.feed.push(...r.feed);
      all.tones.push(...r.tones);
      all.fx = r.fx ?? all.fx;
    }
    return all;
  }

  /** Commands that all land before the screen shows any of them. */
  burst(...cmds: Command[]): Round {
    const entries = cmds.flatMap((c) => this.send(c));
    this.events(entries);
    this.projection();
    return this.collect();
  }

  /**
   * A scene the harness has no honest client command for: `room.ts`'s `TIMEOUT_COMMANDS` stamps `data.timeout` onto
   * events from a scheduler command (the engine itself never knows a deadline fired). Mimics that stamp so the
   * timeout-aware copy in `derive/` can be exercised without a server.
   */
  timedOut(cmd: Command): Round {
    const entries = this.send(cmd).map((e) => ({ ...e, data: { ...e.data, timeout: true } }));
    this.events(entries);
    this.projection();
    return this.collect();
  }
}

function only<K extends Beat['kind']>(beats: Beat[], kind: K): Extract<Beat, { kind: K }> {
  const found = beats.filter((b) => b.kind === kind);
  expect(found, `beats of kind ${kind} in ${JSON.stringify(beats.map((b) => b.kind))}`).toHaveLength(1);
  return found[0] as Extract<Beat, { kind: K }>;
}
const kinds = (beats: Beat[]) => beats.map((b) => b.kind);
const idsOf = (cards: Card[]) => cards.map((c) => c.id);
const setIdOf = (cs: ClientGameState, owner: string, color: string) => {
  const board = cs.players.find((p) => p.id === owner)!.board;
  return board.sets.find((s) => s.color === color)!.id;
};
const jsnCard = (id: string): Card => ({ id, kind: 'action', action: 'just_say_no', value: 4 });
const p = (id: string) => (s: GameState) => s.players.find((x) => x.id === id)!;

describe('baseline', () => {
  it('ignores the first projection, whatever the log already holds', () => {
    const old: GameEvent[] = [
      { type: 'card_banked', playerId: 'p2', message: 'p2 banked a card worth ₹1Cr', data: { cardId: 'mb3' } },
      { type: 'cards_drawn', playerId: 'p1', message: 'p1 drew 2 cards', data: { count: 2 } },
    ];
    const t = new Table(fixtures.standardMidGame(), 'p1', old);
    expect(t.live.beat).toBeNull();
    expect(t.live.feed).toEqual([]);
    expect(t.live.queue).toEqual([]);
    expect(t.live.lastLogId).toBe(2);
  });

  it('does not replay history after a reload mid-game', () => {
    const played = new Table(fixtures.standardMidGame(), 'p1');
    played.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'm1', zone: 'bank' });
    // The page reloads: same game, the log the store rebuilt is empty, the first projection is the baseline.
    const reloaded = new Table(played.state, 'p1');
    expect(reloaded.live.beat).toBeNull();
    expect(reloaded.live.feed).toEqual([]);
  });

  it('does not act out a threat that was already pending at the baseline, but still shows what it resolves to', () => {
    const start = fixtures.responsiveMidGame();
    p('p2')(start).board.sets[1]!.cards.pop();
    const mid = new Table(start, 'p2');
    mid.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'sd1', zone: 'discard' }, { type: 'SELECT_STEAL_TARGET', playerId: 'p1', targetCardId: 'lb1' });
    const reloaded = new Table(mid.state, 'p2');
    expect(reloaded.live.beat).toBeNull();
    const r = reloaded.play({ type: 'DECLINE_JUST_SAY_NO', playerId: 'p2' });
    expect(kinds(r.beats)).toEqual(['loot']);
  });

  it('holds fresh events until their projection lands', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    const cmd: Command = { type: 'PLAY_CARD', playerId: 'p1', cardId: 'm1', zone: 'bank' };
    const entries = (t as unknown as { send(c: Command): LogEntry[] }).send(cmd);
    (t as unknown as { events(e: LogEntry[]): void }).events(entries);
    expect(t.live.beat).toBeNull();
    expect(t.live.held.length).toBeGreaterThan(0);
    (t as unknown as { projection(): void }).projection();
    // The first scene starts in the very render the projection lands in.
    expect(t.live.beat?.kind).toBe('lay');
    expect(t.live.held).toEqual([]);
  });

  it('flushes events whose projection never comes', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    const entries = (t as unknown as { send(c: Command): LogEntry[] }).send({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'm1', zone: 'bank' });
    (t as unknown as { events(e: LogEntry[]): void }).events(entries);
    t.live = flush(t.live);
    expect(t.live.held).toEqual([]);
    expect(t.collect().feed).toEqual([`You banked ${money(2)}`]);
  });
});

describe('own plays', () => {
  it('banks money: a lay into the bank, a +cash stamp, a feed line', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    const r = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'm1', zone: 'bank' });
    const lay = only(r.beats, 'lay');
    expect(lay).toMatchObject({ by: 'p1', into: 'bank' });
    expect(lay.card.id).toBe('m1');
    expect(r.fx).toMatchObject({ kind: 'bank', text: `+${money(2)}`, amount: 2 });
    expect(r.feed).toEqual([`You banked ${money(2)}`]);
    expect(r.tones).toEqual(['you']);
    expect(r.waits[0]).toBe(sceneMs(lay, 'p1'));
  });

  it('banks an action card with its value', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    const r = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'pg1', zone: 'bank' });
    expect(only(r.beats, 'lay').card.id).toBe('pg1');
    expect(r.feed).toEqual([`You banked Pass Go (${money(1)})`]);
  });

  it('lays a property into a new set', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    const r = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'pr1', zone: 'property' });
    const lay = only(r.beats, 'lay');
    const card = lay.card as Extract<Card, { kind: 'property' }>;
    expect(lay).toMatchObject({ by: 'p1', into: 'set', completed: false });
    expect(lay.setId).toBe(setIdOf(t.cs, 'p1', 'red'));
    expect(r.fx).toMatchObject({ kind: 'build', text: card.name, color: 'red' });
    expect(r.feed).toEqual([`You played ${card.name}`]);
  });

  it('lays a wild where the player put it', () => {
    const t = new Table(fixtures.wildcardUsage(), 'p1');
    const r = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'wc_dual', zone: 'property', target: { assignedColor: 'pink' } });
    const lay = only(r.beats, 'lay');
    expect(lay.card).toMatchObject({ id: 'wc_dual', kind: 'property_wild', assignedColor: 'pink' });
    expect(lay.setId).toBe(setIdOf(t.cs, 'p1', 'pink'));
    expect(r.fx).toMatchObject({ kind: 'build', text: `${stateName('pink')} +1`, color: 'pink' });
    expect(r.feed).toEqual([`You played Wild as ${stateName('pink')}`]);
  });

  it('marks a lay that completes a set', () => {
    const start = fixtures.standardMidGame();
    p('p1')(start).hand.push({ id: 'o3', kind: 'property', color: 'orange', value: 2, name: 'Orange Three' });
    const t = new Table(start, 'p1');
    const r = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'o3', zone: 'property' });
    const lay = only(r.beats, 'lay');
    expect(lay).toMatchObject({ into: 'set', completed: true, setId: setIdOf(t.cs, 'p1', 'orange') });
    expect(r.fx).toMatchObject({ kind: 'set', text: `${stateName('orange')} complete!`, color: 'orange' });
    expect(r.tones).toEqual(['good']);
  });

  it('stamps the win when the lay is the third set', () => {
    const t = new Table(fixtures.oneSetFromWinning(), 'p1');
    const r = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'db2', zone: 'property' });
    expect(only(r.beats, 'lay')).toMatchObject({ completed: true });
    expect(r.fx).toMatchObject({ kind: 'win', text: 'Three sets!' });
    expect(r.feed.at(-1)).toBe('You won with 3 sets!');
  });

  it('builds a house onto a set (a lay into the set)', () => {
    const start = fixtures.standardMidGame();
    p('p1')(start).hand.push({ id: 'hs1', kind: 'action', action: 'house', value: 3 });
    const t = new Table(start, 'p1');
    const r = t.play(
      { type: 'PLAY_CARD', playerId: 'p1', cardId: 'hs1', zone: 'discard' },
      { type: 'SELECT_BUILDING_SET', playerId: 'p1', setId: 'set_lb' },
    );
    const lay = only(r.beats, 'lay');
    expect(lay).toMatchObject({ by: 'p1', into: 'set', setId: 'set_lb' });
    expect(lay.card.id).toBe('hs1');
    expect(r.fx).toMatchObject({ kind: 'build', text: 'House' });
  });
});

describe('rivals', () => {
  it('a rival banking is a lay into their bank, with no stamp; their draw is silent', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    const end = t.play({ type: 'END_TURN', playerId: 'p1' });
    expect(end.beats).toEqual([]);
    expect(end.feed).toEqual(["Priya's turn"]);
    expect(end.tones).toEqual(['sys']);

    const r = t.play({ type: 'DRAW_TURN_CARDS', playerId: 'p2' }, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'm2', zone: 'bank' });
    const lay = only(r.beats, 'lay');
    expect(lay).toMatchObject({ by: 'p2', into: 'bank' });
    expect(lay.card.id).toBe('m2');
    expect(r.fx).toBeNull();
    expect(r.feed).toEqual([`Priya banked ${money(1)}`]);
    expect(r.tones).toEqual(['rival']);
  });

  it('a rival laying a property finds the card on their table', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    t.play({ type: 'END_TURN', playerId: 'p1' }, { type: 'DRAW_TURN_CARDS', playerId: 'p2' }, { type: 'END_TURN', playerId: 'p2' });
    const r = t.play({ type: 'DRAW_TURN_CARDS', playerId: 'p3' }, { type: 'PLAY_CARD', playerId: 'p3', cardId: 'g1', zone: 'property' });
    const lay = only(r.beats, 'lay');
    expect(lay).toMatchObject({ by: 'p3', into: 'set', completed: false, setId: setIdOf(t.cs, 'p3', 'green') });
    expect(lay.card.id).toBe('g1');
    expect(r.feed).toEqual([`Marcus played ${cardName(lay.card)}`]);
  });

  it("a rival's Pass Go is their card thrown; the cards they drew are unseen", () => {
    const start = fixtures.standardMidGame();
    start.currentPlayerIndex = 1;
    p('p2')(start).hand.push({ id: 'pg2', kind: 'action', action: 'pass_go', value: 1 });
    const t = new Table(start, 'p1');
    const r = t.play({ type: 'PLAY_CARD', playerId: 'p2', cardId: 'pg2', zone: 'discard' });
    expect(kinds(r.beats)).toEqual(['toss']);
    expect(r.beats[0]).toMatchObject({ kind: 'toss', by: 'p2', card: { id: 'pg2' } });
    expect(r.feed).toEqual(['Priya played Pass Go']);
  });

  it('a rival Double the Rent is a card thrown', () => {
    const start = fixtures.doubleRentCombo();
    start.currentPlayerIndex = 0;
    const t = new Table(start, 'p2');
    const r = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'dbl1', zone: 'discard' });
    expect(r.beats[0]).toMatchObject({ kind: 'toss', by: 'p1', card: { id: 'dbl1' } });
    expect(r.feed).toEqual(['Aarav played Double the Rent']);
  });

  it('a rival hand-limit discard throws the top of the pile', () => {
    const start = fixtures.standardMidGame();
    start.currentPlayerIndex = 1;
    p('p2')(start).hand = Array.from({ length: 9 }, (_, i) => ({ id: `x${i}`, kind: 'money' as const, amount: 1, value: 1 }));
    const t = new Table(start, 'p1');
    const r = t.play({ type: 'FORCE_END_TURN', playerId: 'p2' });
    expect(r.beats[0]).toMatchObject({ kind: 'toss', by: 'p2' });
    expect(r.feed).toContain('Priya discarded 2 cards');
  });

  it('the turn clock running out force-ends the turn, and the feed says so before naming who is up', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    // The 60s turn window expired server-side (FORCE_END_TURN), not an END TURN tap.
    const r = t.timedOut({ type: 'FORCE_END_TURN', playerId: 'p1' });
    expect(r.feed[0]).toBe('Time ran out: your turn ended');
    expect(r.feed).toContain("Priya's turn");
  });

  it('your own connection coming and going is not a table line', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    expect(t.play({ type: 'PLAYER_CONNECTION_CHANGED', playerId: 'p1', connected: true }).feed).toEqual([]);
  });

  it('a seat going away is a system line', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    const r = t.play({ type: 'PLAYER_CONNECTION_CHANGED', playerId: 'p3', connected: false });
    expect(r.beats).toEqual([]);
    expect(r.feed).toEqual(['Marcus is away']);
    expect(r.tones).toEqual(['sys']);
  });
});

describe('the turn', () => {
  it('drawing your cards deals them into your hand', () => {
    const t = new Table(fixtures.emptyHand(), 'p1');
    const r = t.play({ type: 'DRAW_TURN_CARDS', playerId: 'p1' });
    const deal = only(r.beats, 'deal');
    expect(deal.to).toBe('p1');
    expect(deal.played).toBeUndefined();
    expect(idsOf(deal.cards)).toEqual(idsOf(t.cs.hand));
    expect(deal.cards).toHaveLength(5);
    expect(r.fx).toMatchObject({ kind: 'draw', text: '+5 cards', amount: 5 });
    expect(r.feed).toEqual(['You drew 5 cards']);
  });

  it("someone else's draw stages nothing", () => {
    const start = fixtures.emptyHand();
    start.currentPlayerIndex = 1;
    const t = new Table(start, 'p1');
    const r = t.play({ type: 'DRAW_TURN_CARDS', playerId: 'p2' });
    expect(r.beats).toEqual([]);
    expect(r.feed).toEqual([]);
  });

  it('a turn passing to you says so', () => {
    const start = fixtures.standardMidGame();
    start.currentPlayerIndex = 3;
    const t = new Table(start, 'p1');
    const r = t.play({ type: 'END_TURN', playerId: 'p4' });
    expect(r.feed).toEqual(['Your turn']);
  });

  it('Pass Go throws the card and deals what it paid for', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    const before = new Set(idsOf(t.cs.hand));
    const r = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'pg1', zone: 'discard' });
    const deal = only(r.beats, 'deal');
    expect(deal.to).toBe('p1');
    expect(deal.played?.id).toBe('pg1');
    expect(deal.cards).toHaveLength(2);
    expect(deal.cards.every((c) => !before.has(c.id) && idsOf(t.cs.hand).includes(c.id))).toBe(true);
    expect(r.fx).toMatchObject({ kind: 'draw', text: '+2 cards', amount: 2 });
    expect(r.feed).toEqual(['You played Pass Go']);
  });

  it('a hand-limit discard tosses each card you let go, one scene apiece', () => {
    const t = new Table(fixtures.overHandLimit(), 'p1');
    const r = t.play({ type: 'DISCARD_EXCESS', playerId: 'p1', cardIds: ['oh0', 'oh1'] });
    expect(kinds(r.beats)).toEqual(['toss', 'toss']);
    expect(r.beats.map((b) => (b.kind === 'toss' ? b.card.id : ''))).toEqual(['oh0', 'oh1']);
    expect(r.beats.every((b) => b.kind === 'toss' && b.by === 'p1')).toBe(true);
    expect(r.feed).toEqual(['You discarded 2 cards', "Priya's turn"]);
  });

  it('a wasted rent card is tossed', () => {
    const start = fixtures.standardMidGame();
    p('p1')(start).hand.push({ id: 'rw', kind: 'rent', rentType: 'dual', colors: ['pink', 'green'], value: 1 });
    const t = new Table(start, 'p1');
    const r = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'rw', zone: 'discard' });
    expect(r.beats[0]).toMatchObject({ kind: 'toss', by: 'p1', card: { id: 'rw' } });
    expect(r.feed).toEqual(['You wasted Rent']);
  });

  it('a Double the Rent is tossed and remembered for the rent that follows', () => {
    const t = new Table(fixtures.doubleRentCombo(), 'p1');
    const r = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'dbl1', zone: 'discard' });
    expect(r.beats[0]).toMatchObject({ kind: 'toss', card: { id: 'dbl1' } });
    expect(r.feed).toEqual(['You played Double the Rent']);
  });
});

describe('attacks', () => {
  it('Sly Deal by you: nothing until it lands, then the loot', () => {
    const t = new Table(fixtures.responsiveMidGame(), 'p1');
    const aim = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'sd1', zone: 'discard' });
    expect(aim.beats).toEqual([]);
    expect(aim.feed).toEqual([]);

    // Marcus holds no Just Say No, but his window opens all the same: nothing lands until he answers.
    const asked = t.play({ type: 'SELECT_STEAL_TARGET', playerId: 'p1', targetCardId: 'u1' });
    expect(asked.beats).toEqual([]);
    expect(asked.feed).toEqual([]);

    const r = t.play({ type: 'DECLINE_JUST_SAY_NO', playerId: 'p3' });
    const loot = only(r.beats, 'loot');
    expect(loot).toMatchObject({ by: 'p1', from: 'p3', label: 'SLY DEAL' });
    expect(loot.card.id).toBe('u1');
    expect(loot.played.id).toBe('sd1');
    expect(loot.setId).toBe(setIdOf(t.cs, 'p1', 'utility'));
    expect(r.fx).toMatchObject({ kind: 'steal', text: `Stole ${cardName(loot.card)}`, color: 'utility' });
    expect(r.feed).toEqual([`You Sly Dealt ${cardName(loot.card)} from Marcus`]);
    expect(r.tones).toEqual(['good']);
  });

  it('Sly Deal on you with no way to say no: the same grab as with one, then the loot when you let it go', () => {
    const t = new Table(fixtures.responsiveMidGame(), 'p3');
    const asked = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'sd1', zone: 'discard' }, { type: 'SELECT_STEAL_TARGET', playerId: 'p1', targetCardId: 'u1' });
    expect(kinds(asked.beats)).toEqual(['grab']);
    const r = t.play({ type: 'DECLINE_JUST_SAY_NO', playerId: 'p3' });
    expect(kinds(r.beats)).toEqual(['loot']);
    expect(r.beats[0]).toMatchObject({ by: 'p1', from: 'p3' });
    expect(r.fx).toMatchObject({ kind: 'stolen' });
    expect(r.feed).toEqual(['You let it through', expect.stringMatching(/^Aarav stole your /)]);
    expect(r.tones).toEqual(['you', 'bad']);
  });

  it('a Just Say No window nobody answered names the timeout, not a choice', () => {
    const t = new Table(fixtures.responsiveMidGame(), 'p3');
    t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'sd1', zone: 'discard' }, { type: 'SELECT_STEAL_TARGET', playerId: 'p1', targetCardId: 'u1' });
    // The window's clock hit zero server-side (AUTO_RESOLVE_PENDING), not a tap on "Let it go".
    const r = t.timedOut({ type: 'AUTO_RESOLVE_PENDING', playerId: 'p3' });
    expect(r.feed).toEqual(['Time ran out: you let it through', expect.stringMatching(/^Aarav stole your /)]);
    expect(r.tones).toEqual(['you', 'bad']);
  });

  describe('Sly Deal on you, with a Just Say No to play', () => {
    const scene = (viewer: string) => {
      const start = fixtures.responsiveMidGame();
      // Priya's light blue is no longer a complete set, so it can be Sly Dealt.
      p('p2')(start).board.sets[1]!.cards.pop();
      return new Table(start, viewer);
    };
    const attack: Command[] = [
      { type: 'PLAY_CARD', playerId: 'p1', cardId: 'sd1', zone: 'discard' },
      { type: 'SELECT_STEAL_TARGET', playerId: 'p1', targetCardId: 'lb1' },
    ];

    it('grabs the card, once, and waits for the answer', () => {
      const t = scene('p2');
      const r = t.play(...attack);
      const grab = only(r.beats, 'grab');
      expect(grab).toMatchObject({ by: 'p1', from: 'p2', label: 'SLY DEAL' });
      expect(grab.card.id).toBe('lb1');
      expect(grab.played.id).toBe('sd1');
      expect(r.feed).toEqual([`Aarav plays Sly Deal on your ${cardName(grab.card)}`]);
      expect(r.tones).toEqual(['bad']);
      // Later projections of the same pending threat (timers, reconnects) do not grab again.
      t.live = ingest(t.live, t.log, t.view());
      t.live = ingest(t.live, t.log, t.view());
      expect(drain(t.live).beats).toEqual([]);
    });

    it('a Just Say No from you blocks it', () => {
      const t = scene('p2');
      t.play(...attack);
      const r = t.play({ type: 'RESPOND_JUST_SAY_NO', playerId: 'p2', cardId: 'jsn1' });
      const block = only(r.beats, 'block');
      expect(block).toMatchObject({ by: 'p2', against: 'p1', label: 'JUST SAY NO!' });
      expect(block.played.id).toBe('jsn1');
      expect(block.card.id).toBe('lb1');
      expect(r.fx).toMatchObject({ kind: 'jsn', text: 'Just Say No!' });
      expect(r.feed).toEqual(["You said NO to Aarav's Sly Deal"]);
      expect(r.tones).toEqual(['good']);
    });

    it('letting it through is the loot, after the grab', () => {
      const t = scene('p2');
      t.play(...attack);
      const r = t.play({ type: 'DECLINE_JUST_SAY_NO', playerId: 'p2' });
      const loot = only(r.beats, 'loot');
      expect(loot).toMatchObject({ by: 'p1', from: 'p2', label: 'SLY DEAL' });
      expect(loot.card.id).toBe('lb1');
      expect(loot.played.id).toBe('sd1');
      expect(loot.setId).toBe(setIdOf(t.cs, 'p1', 'light_blue'));
      expect(r.fx).toMatchObject({ kind: 'stolen' });
      expect(r.feed).toEqual(['You let it through', expect.stringMatching(/^Aarav stole your /)]);
    });

    it("a rival's Just Say No against your Sly Deal is a block against you", () => {
      const t = scene('p1');
      const aim = t.play(...attack);
      expect(aim.beats).toEqual([]);
      const r = t.play({ type: 'RESPOND_JUST_SAY_NO', playerId: 'p2', cardId: 'jsn1' });
      const block = only(r.beats, 'block');
      expect(block).toMatchObject({ by: 'p2', against: 'p1' });
      expect(block.played.id).toBe('jsn1');
      expect(block.card.id).toBe('lb1');
      expect(r.fx).toBeNull();
      expect(r.feed[0]).toBe('Priya said NO to your Sly Deal');
      expect(r.tones[0]).toBe('bad');
    });

    it("a rival's Just Say No on a play that is not yours is a card thrown", () => {
      const t = scene('p3');
      const aim = t.play(...attack);
      expect(aim.beats).toEqual([]);
      const r = t.play({ type: 'RESPOND_JUST_SAY_NO', playerId: 'p2', cardId: 'jsn1' });
      expect(r.beats[0]).toMatchObject({ kind: 'toss', by: 'p2', card: { id: 'jsn1' } });
      expect(r.feed[0]).toBe("Priya said NO to Aarav's Sly Deal");
      expect(r.tones[0]).toBe('rival');
    });

    it('a counter Just Say No from you is a block too, and the chain goes on', () => {
      const start = fixtures.responsiveMidGame();
      p('p2')(start).board.sets[1]!.cards.pop();
      p('p1')(start).hand.push(jsnCard('jsn_p1'));
      const t = new Table(start, 'p1');
      t.play(...attack);
      t.play({ type: 'RESPOND_JUST_SAY_NO', playerId: 'p2', cardId: 'jsn1' });
      const r = t.play({ type: 'RESPOND_JUST_SAY_NO', playerId: 'p1', cardId: 'jsn_p1' });
      const block = only(r.beats, 'block');
      expect(block).toMatchObject({ by: 'p1', against: 'p2' });
      expect(block.played.id).toBe('jsn_p1');
      expect(r.feed[0]).toBe('You said NO right back!');
    });
  });

  it('Forced Deal: the loot of the card you take, then the card you give', () => {
    const start = fixtures.responsiveMidGame();
    const t = new Table(start, 'p3');
    // Aarav offers his own orange for Marcus's utility (no complete sets involved, no Just Say No in the way).
    p('p3')(t.state).hand.push({ id: 'fd_x', kind: 'action', action: 'forced_deal', value: 3 });
    p('p1')(t.state).hand.push({ id: 'fd_y', kind: 'action', action: 'forced_deal', value: 3 });
    t.state = { ...t.state };
    t.play(
      { type: 'PLAY_CARD', playerId: 'p1', cardId: 'fd_y', zone: 'discard' },
      { type: 'SELECT_STEAL_TARGET', playerId: 'p1', targetCardId: 'u1', ownCardId: 'gr1' },
    );
    const r = t.play({ type: 'DECLINE_JUST_SAY_NO', playerId: 'p3' });
    expect(kinds(r.beats)).toEqual(['loot', 'pay']);
    const loot = only(r.beats, 'loot');
    const swap = only(r.beats, 'pay');
    expect(loot).toMatchObject({ by: 'p1', from: 'p3', label: 'FORCED DEAL' });
    expect(loot.card.id).toBe('u1');
    expect(loot.played.id).toBe('fd_y');
    expect(swap).toMatchObject({ by: 'p1', to: 'p3', label: 'SWAP' });
    expect(idsOf(swap.cards)).toEqual(['gr1']);
    expect(r.feed).toEqual(['You let it through', expect.any(String)]);
  });

  it('Deal Breaker takes the whole set, buildings and all', () => {
    const t = new Table(fixtures.dealBreakerOnSetWithHotel(), 'p1');
    t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'dbk1', zone: 'discard' }, { type: 'SELECT_STEAL_TARGET', playerId: 'p1', targetSetId: 'set_yellow_full' });
    const r = t.play({ type: 'DECLINE_JUST_SAY_NO', playerId: 'p2' });
    const raid = only(r.beats, 'raid');
    expect(raid).toMatchObject({ by: 'p1', from: 'p2', label: 'DEAL BREAKER' });
    expect(new Set(idsOf(raid.set.cards))).toEqual(new Set(['y1', 'y2', 'y3', 'h1', 'ht1']));
    expect(raid.set.id).toBe(setIdOf(t.cs, 'p1', 'yellow'));
    expect(raid.played.id).toBe('dbk1');
    expect(r.fx).toMatchObject({ kind: 'steal', text: `Took ${stateName('yellow')}`, color: 'yellow' });
    expect(r.feed).toEqual([`You took Priya's ${stateName('yellow')} — Deal Breaker!`]);
    expect(r.tones).toEqual(['good']);
  });

  it('Deal Breaker on you, with a Just Say No to play: a grab on the set, then the raid', () => {
    const start = fixtures.dealBreakerOnSetWithHotel();
    p('p2')(start).hand.push(jsnCard('jsn_p2'));
    const t = new Table(start, 'p2');
    const first = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'dbk1', zone: 'discard' }, { type: 'SELECT_STEAL_TARGET', playerId: 'p1', targetSetId: 'set_yellow_full' });
    const grab = only(first.beats, 'grab');
    expect(grab).toMatchObject({ by: 'p1', from: 'p2', label: 'DEAL BREAKER' });
    expect(grab.card.id).toBe('y1');
    expect(grab.played.id).toBe('dbk1');
    expect(first.feed).toEqual([`Aarav plays Deal Breaker on your ${stateName('yellow')}`]);

    const r = t.play({ type: 'DECLINE_JUST_SAY_NO', playerId: 'p2' });
    const raid = only(r.beats, 'raid');
    expect(raid).toMatchObject({ by: 'p1', from: 'p2' });
    expect(r.tones.at(-1)).toBe('bad');
  });
});

describe('money', () => {
  it('Debt Collector by you: the card lands on the payer, their payment follows as its own beat', () => {
    const t = new Table(fixtures.debtCollectorChoice(), 'p1');
    const aim = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'dc1', zone: 'discard' });
    expect(aim.beats).toEqual([]);

    const charged = t.play({ type: 'SELECT_DEBT_COLLECTOR_PLAYER', playerId: 'p1', targetPlayerId: 'p2' });
    const levy = only(charged.beats, 'levy');
    expect(levy).toMatchObject({ by: 'p1', aimed: 'p2', label: 'DEBT COLLECTOR', takes: [] });
    expect(levy.played.id).toBe('dc1');
    expect(charged.feed).toEqual([`You demanded ${money(5)} from Priya`]);
    expect(charged.tones).toEqual(['good']);

    const paid = t.play({ type: 'SELECT_PAYMENT', playerId: 'p2', cardIds: ['p2b'] });
    const pay = only(paid.beats, 'pay');
    expect(pay).toMatchObject({ by: 'p2', to: 'p1', label: `+${money(5)}` });
    expect(idsOf(pay.cards)).toEqual(['p2b']);
    expect(paid.fx).toMatchObject({ kind: 'collect', text: `+${money(5)}`, amount: 5 });
    expect(paid.feed).toEqual([`Priya paid you ${money(5)}`]);
    expect(paid.tones).toEqual(['good']);
  });

  it('Debt Collector on you: the bill arrives, then you pay', () => {
    const t = new Table(fixtures.debtCollectorChoice(), 'p2');
    const charged = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'dc1', zone: 'discard' }, { type: 'SELECT_DEBT_COLLECTOR_PLAYER', playerId: 'p1', targetPlayerId: 'p2' });
    const levy = only(charged.beats, 'levy');
    expect(levy).toMatchObject({ by: 'p1', aimed: 'p2', label: `DEBT ${money(5)}`, takes: [] });
    expect(charged.feed).toEqual([`Aarav plays Debt Collector — you owe ${money(5)}`]);
    expect(charged.tones).toEqual(['bad']);

    const paid = t.play({ type: 'SELECT_PAYMENT', playerId: 'p2', cardIds: ['p2b'] });
    const pay = only(paid.beats, 'pay');
    expect(pay).toMatchObject({ by: 'p2', to: 'p1', label: `−${money(5)}` });
    expect(paid.fx).toMatchObject({ kind: 'pay', text: `Paid ${money(5)}`, amount: 5 });
    expect(paid.feed).toEqual([`You paid Aarav ${money(5)}`]);
    expect(paid.tones).toEqual(['bad']);
  });

  it('a payment window nobody answered auto-pays, and the feed says the clock did it', () => {
    const t = new Table(fixtures.debtCollectorChoice(), 'p2');
    // The demand opens with its own Just Say No offer; declining it (not a timeout) is what turns it into a real payment.
    t.play(
      { type: 'PLAY_CARD', playerId: 'p1', cardId: 'dc1', zone: 'discard' },
      { type: 'SELECT_DEBT_COLLECTOR_PLAYER', playerId: 'p1', targetPlayerId: 'p2' },
      { type: 'DECLINE_JUST_SAY_NO', playerId: 'p2' },
    );
    // The 30s payment window expired server-side (AUTO_RESOLVE_PENDING auto-picks cheapest), not a tap on PAY.
    const paid = t.timedOut({ type: 'AUTO_RESOLVE_PENDING', playerId: 'p2' });
    expect(paid.feed).toEqual([`Time ran out: you paid Aarav ${money(5)}`]);
    expect(paid.tones).toEqual(['bad']);
  });

  it('Debt Collector by you on a rival with nothing to pay with: the levy carries a BROKE take', () => {
    const t = new Table(fixtures.debtCollectorChoice(), 'p1');
    t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'dc1', zone: 'discard' });
    const charged = t.play({ type: 'SELECT_DEBT_COLLECTOR_PLAYER', playerId: 'p1', targetPlayerId: 'p4' });
    const levy = only(charged.beats, 'levy');
    expect(levy).toMatchObject({ by: 'p1', aimed: 'p4' });
    expect(levy.takes).toEqual([{ from: 'p4', owed: 5, cards: [] }]);
  });

  it("a Debt Collector between two other players lands on the payer's seat", () => {
    const t = new Table(fixtures.debtCollectorChoice(), 'p3');
    const r = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'dc1', zone: 'discard' }, { type: 'SELECT_DEBT_COLLECTOR_PLAYER', playerId: 'p1', targetPlayerId: 'p2' });
    expect(only(r.beats, 'levy')).toMatchObject({ by: 'p1', aimed: 'p2' });
    expect(r.feed).toEqual([`Aarav demands ${money(5)} from Priya`]);
    expect(r.tones).toEqual(['rival']);
    const paid = t.play({ type: 'SELECT_PAYMENT', playerId: 'p2', cardIds: ['p2b'] });
    expect(only(paid.beats, 'pay')).toMatchObject({ by: 'p2', to: 'p1', label: money(5) });
    expect(paid.fx).toBeNull();
    expect(paid.tones).toEqual(['rival']);
  });

  it("It's My Birthday by you: one levy, then a payment beat per payer", () => {
    const t = new Table(fixtures.parallelBirthdayCollection(), 'p1');
    const played = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'bd1', zone: 'discard' });
    const levy = only(played.beats, 'levy');
    expect(levy).toMatchObject({ by: 'p1', label: 'HAPPY BIRTHDAY!', takes: [] });
    expect(levy.aimed).toBeUndefined();
    expect(levy.setId).toBeUndefined();
    expect(levy.played.id).toBe('bd1');
    expect(played.feed).toEqual(["You played It's My Birthday"]);

    const paid = t.play(
      { type: 'SELECT_PAYMENT', playerId: 'p2', cardIds: ['p2b'] },
      { type: 'SELECT_PAYMENT', playerId: 'p3', cardIds: ['p3b'] },
      { type: 'SELECT_PAYMENT', playerId: 'p4', cardIds: ['p4b'] },
    );
    expect(paid.beats.map((b) => (b.kind === 'pay' ? `${b.by}>${b.to}:${idsOf(b.cards)}` : b.kind))).toEqual(['p2>p1:p2b', 'p3>p1:p3b', 'p4>p1:p4b']);
    expect(paid.feed).toEqual([`Priya paid you ${money(2)}`, `Marcus paid you ${money(2)}`, `Yuki paid you ${money(1)}`]);
  });

  it("It's My Birthday by you: payments that back up together land as one scene, not one camera hold each", () => {
    const t = new Table(fixtures.parallelBirthdayCollection(), 'p1');
    t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'bd1', zone: 'discard' });
    // The levy's own beat has already played out and gone by the time these two payments land — nothing left in
    // this batch to settle them against (see money.ts's `settled`) — so each would, without the fold in
    // `beats.ts`'s `advance`, hold the camera on p1 for 2s in turn. Landing together (a slow network catching up,
    // or two rivals answering within the same tick) is exactly the backlog that fold exists for.
    const paid = t.burst({ type: 'SELECT_PAYMENT', playerId: 'p2', cardIds: ['p2b'] }, { type: 'SELECT_PAYMENT', playerId: 'p3', cardIds: ['p3b'] });
    const pay = only(paid.beats, 'pay');
    expect(pay).toMatchObject({ by: 'p2', to: 'p1', label: `+${money(2)}` });
    expect(idsOf(pay.cards)).toEqual(['p2b']);
    expect(pay.also).toMatchObject([{ by: 'p3', label: `+${money(2)}` }]);
    expect(idsOf(pay.also![0]!.cards)).toEqual(['p3b']);
    expect(paid.feed).toEqual([`Priya paid you ${money(2)}`, `Marcus paid you ${money(2)}`]);
  });

  it("It's My Birthday against you", () => {
    const t = new Table(fixtures.parallelBirthdayCollection(), 'p2');
    const played = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'bd1', zone: 'discard' });
    expect(only(played.beats, 'levy')).toMatchObject({ by: 'p1', label: `BIRTHDAY ${money(2)}` });
    expect(played.feed).toEqual([`Aarav played It's My Birthday — you owe ${money(2)}`]);
    expect(played.tones).toEqual(['bad']);
    const paid = t.play({ type: 'SELECT_PAYMENT', playerId: 'p2', cardIds: ['p2b'] });
    expect(only(paid.beats, 'pay')).toMatchObject({ by: 'p2', to: 'p1', label: `−${money(2)}` });
  });

  it('Rent by you: one levy naming the set, payments as they come', () => {
    const t = new Table(fixtures.parallelRentCollection(), 'p1');
    const played = t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'rent_brown_lb', zone: 'discard' });
    const levy = only(played.beats, 'levy');
    expect(levy).toMatchObject({ by: 'p1', setId: 'set_brown', takes: [] });
    expect(levy.label).toMatch(/^RENT /);
    expect(levy.played.id).toBe('rent_brown_lb');
    expect(played.feed).toEqual([`You charged ${money(2)} rent on ${stateName('brown')}`]);

    const paid = t.play(
      { type: 'SELECT_PAYMENT', playerId: 'p2', cardIds: ['p2m'] },
      { type: 'SELECT_PAYMENT', playerId: 'p3', cardIds: ['p3m'] },
    );
    expect(kinds(paid.beats)).toEqual(['pay', 'pay']);
  });

  it('a levy and its payments that land in one burst travel together, with what each payer handed over', () => {
    const t = new Table(fixtures.parallelBirthdayCollection(), 'p1');
    const r = t.burst(
      { type: 'PLAY_CARD', playerId: 'p1', cardId: 'bd1', zone: 'discard' },
      { type: 'SELECT_PAYMENT', playerId: 'p2', cardIds: ['p2b'] },
      { type: 'SELECT_PAYMENT', playerId: 'p3', cardIds: ['p3b'] },
    );
    expect(kinds(r.beats)).toEqual(['levy']);
    const levy = only(r.beats, 'levy');
    expect(levy.takes.map((x) => `${x.from}:${idsOf(x.cards)}`).sort()).toEqual(['p2:p2b', 'p3:p3b']);
    expect(r.feed.filter((l) => l.includes('paid'))).toHaveLength(2);
    // Yuki pays later, on her own: a payment beat of her own.
    const late = t.play({ type: 'SELECT_PAYMENT', playerId: 'p4', cardIds: ['p4b'] });
    expect(only(late.beats, 'pay')).toMatchObject({ by: 'p4', to: 'p1' });
  });
});

describe('reset', () => {
  it('a log that shrinks is a new game: the stage is cleared and the feed starts over', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'm1', zone: 'bank' });
    expect(t.live.feed.length).toBeGreaterThan(0);
    t.live = ingest(t.live, [], project(fixtures.responsiveMidGame(), 'p1'));
    expect(t.live.beat).toMatchObject({ kind: 'reset' });
    expect(t.live.feed).toEqual([]);
    expect(t.live.queue).toEqual([]);
    const after = drain(t.live);
    expect(kinds(after.beats)).toEqual(['reset']);
  });

  it('a projection after a gap (new deal, another seat) resets; the very first one does not', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    expect(t.live.beat).toBeNull();
    t.live = ingest(t.live, t.log, null);
    expect(t.live.beat).toBeNull();
    t.live = ingest(t.live, t.log, project(fixtures.standardMidGame(), 'p2', { displayNames: NAMES }));
    expect(t.live.beat).toMatchObject({ kind: 'reset' });
  });

  it('a game_started event announces a fresh deal', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    const entry: LogEntry = { type: 'game_started', message: 'started', id: t.seq + 1, at: '' };
    t.log = [...t.log, entry];
    t.live = ingest(t.live, t.log, t.cs);
    t.cs = project(fixtures.responsiveMidGame(), 'p1', { displayNames: NAMES });
    t.live = ingest(t.live, t.log, t.cs);
    expect(t.live.beat).toMatchObject({ kind: 'reset' });
  });
});

describe('robustness', () => {
  const entry = (t: Table, e: GameEvent): LogEntry => ({ ...e, id: ++t.seq, at: '' });

  it('events without their data drop the beat and keep the line', () => {
    const start = fixtures.standardMidGame();
    const t = new Table(start, 'p1');
    const events: GameEvent[] = [
      { type: 'card_banked', playerId: 'p1', message: 'p1 banked a card worth ₹2Cr' },
      { type: 'property_placed', playerId: 'p1', message: 'p1 placed property on red' },
      { type: 'sly_deal', playerId: 'p1', message: 'p1 sly-dealt u1 from p3' },
      { type: 'payment_made', playerId: 'p2', message: 'p2 paid ₹5Cr to p1 (owed ₹5Cr)' },
      { type: 'rent_charged', playerId: 'p1', message: 'p1 charges p2 ₹2Cr rent' },
      { type: 'just_say_no', playerId: 'p2', message: 'p2 played Just Say No (chain 1)' },
    ];
    t.log = [...t.log, ...events.map((e) => entry(t, e))];
    t.cs = t.view();
    t.live = ingest(t.live, t.log, t.cs);
    const r = t.collect();
    expect(r.beats.filter((b) => b.kind !== 'levy' && b.kind !== 'toss')).toEqual([]);
    expect(r.feed).toContain('You banked a card');
    expect(r.feed).toContain('You played a property');
    expect(r.feed.some((l) => l.includes('sly-dealt'))).toBe(true);
    expect(r.feed.some((l) => l.includes('paid'))).toBe(true);
  });

  it('an event naming a player who is not at the table is ignored, not thrown', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    t.log = [...t.log, entry(t, { type: 'card_banked', playerId: 'ghost', message: 'ghost banked', data: { cardId: 'm1' } })];
    t.cs = t.view();
    expect(() => {
      t.live = ingest(t.live, t.log, t.cs);
    }).not.toThrow();
    expect(t.collect().beats).toEqual([]);
  });

  it('a card that cannot be found is never made up', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    t.log = [...t.log, entry(t, { type: 'card_banked', playerId: 'p2', message: 'p2 banked', data: { cardId: 'nope' } })];
    t.cs = t.view();
    t.live = ingest(t.live, t.log, t.cs);
    const r = t.collect();
    expect(r.beats).toEqual([]);
    expect(r.feed).toEqual(['Priya banked a card']);
  });
});

describe('pacing', () => {
  /** A rival's bank grows by `n` notes between two projections: n lay beats from one batch. */
  const flood = (n: number) => {
    const start = fixtures.standardMidGame();
    const t = new Table(start, 'p1');
    const notes: Card[] = Array.from({ length: n }, (_, i) => ({ id: `note${i}`, kind: 'money' as const, amount: 1, value: 1 }));
    p('p2')(t.state).board.bank.push(...notes);
    t.log = [...t.log, ...notes.map((c) => ({ id: ++t.seq, at: '', type: 'card_banked' as const, playerId: 'p2', message: 'banked', data: { cardId: c.id } }))];
    t.cs = t.view();
    t.live = ingest(t.live, t.log, t.cs);
    return t;
  };

  it('releases one beat at a time, each with a fresh, increasing id and a wait', () => {
    const t = flood(4);
    expect(t.live.beat).toMatchObject({ kind: 'lay', by: 'p2' });
    expect(t.live.queue.filter((s) => s.beat)).toHaveLength(3);
    const seen: number[] = [t.live.beat!.id];
    let cur = t.live;
    while (cur.queue.some((s) => s.beat)) {
      expect(cur.playing).toBeGreaterThan(0);
      cur = release(cur);
      expect(cur.beat).not.toBeNull();
      seen.push(cur.beat!.id);
    }
    expect(seen).toHaveLength(4);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(new Set(seen).size).toBe(4);
    // When the last has had its time, the stage is let go.
    cur = release(cur);
    expect(cur.beat).toBeNull();
    expect(cur.playing).toBe(0);
  });

  it('ignores a timer that belongs to a scene that is over', () => {
    const t = flood(2);
    const stale = t.live.token;
    const next = release(t.live);
    expect(release(next, stale)).toBe(next);
  });

  it('a backlog past the cap gives up its oldest lay/toss animations but keeps every line', () => {
    const t = flood(9);
    const { beats, waits, state } = drain(t.live);
    expect(beats.length).toBeLessThanOrEqual(QUEUE_CAP);
    expect(beats.length).toBeGreaterThan(0);
    expect(state.feed).toHaveLength(9);
    // The newest survive.
    expect(beats.at(-1)).toMatchObject({ kind: 'lay', card: { id: 'note8' } });
    expect(waits.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(WAIT_CAP + 200);
  });

  it('beats that matter are never dropped for a backlog', () => {
    const t = flood(9);
    // A loot lands behind the flood.
    const q = t.live.queue;
    expect(q.some((s) => s.beat?.kind === 'loot')).toBe(false);
    expect(q.filter((s) => s.beat).length).toBeLessThanOrEqual(QUEUE_CAP);
  });

  it('compresses a long backlog so it clears within the cap', () => {
    const t = new Table(fixtures.parallelBirthdayCollection(), 'p1');
    t.play({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'bd1', zone: 'discard' });
    // Six rivals' worth of laying at once: scenes of about a second each would take longer than the cap.
    const r = flood(6).collect();
    expect(r.waits.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(WAIT_CAP + 100);
    expect(Math.min(...r.waits)).toBeGreaterThanOrEqual(200);
  });

  it('caps the feed', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    t.log = [...t.log, ...Array.from({ length: 80 }, () => entry2(t))];
    t.cs = t.view();
    t.live = ingest(t.live, t.log, t.cs);
    expect(drain(t.live).state.feed.length).toBe(60);
  });

  it('gives every beat, stamp and line its own increasing id across a whole game', () => {
    const t = new Table(fixtures.standardMidGame(), 'p1');
    const ids: number[] = [];
    const run = (...cmds: Command[]) => {
      for (const c of cmds) {
        const r = t.play(c);
        ids.push(...r.beats.map((b) => b.id));
      }
    };
    run(
      { type: 'PLAY_CARD', playerId: 'p1', cardId: 'm1', zone: 'bank' },
      { type: 'PLAY_CARD', playerId: 'p1', cardId: 'pr1', zone: 'property' },
      { type: 'PLAY_CARD', playerId: 'p1', cardId: 'pg1', zone: 'discard' },
      { type: 'DRAW_TURN_CARDS', playerId: 'p2' },
      { type: 'PLAY_CARD', playerId: 'p2', cardId: 'm2', zone: 'bank' },
    );
    expect(ids.length).toBeGreaterThanOrEqual(4);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
    const feedIds = t.live.feed.map((f) => f.id);
    expect(new Set([...ids, ...feedIds]).size).toBe(ids.length + feedIds.length);
  });

  function entry2(t: Table): LogEntry {
    return { id: ++t.seq, at: '', type: 'deck_reshuffled', message: 'Discard pile reshuffled into draw pile' };
  }
});
