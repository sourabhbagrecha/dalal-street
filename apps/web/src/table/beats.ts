/**
 * What just happened at the table, in the table's terms.
 *
 * The real game has no reducer to emit beats: the server pushes engine events (`LogEntry`) and then a full
 * projection. This module turns the two into what `TableScreen` plays: the `Beat`s the stage acts out, the one-shot
 * `Fx` stamp and the feed lines. Everything here is pure; `liveEvents.ts` wraps it in a hook.
 *
 * Two inputs per batch:
 * - the fresh log entries (who did what, by id), and
 * - a diff of the previous and the new projection, so a card id from an event becomes the real `Card` (a card the
 *   viewer played has left `you.hand` but was in the previous one; a rival's card is public once played; the last
 *   discard is the played action). Cards are never invented: a beat whose cards cannot be found is dropped and its
 *   feed line kept. The one stand-in is the face of an action *type* (public information) for the card that slams
 *   down, when the real one is no longer findable.
 *
 * Pacing lives here too: one beat per React commit, released through a queue (see `LiveState`).
 */
import type { Card, ClientGameState, ContestedAction, PlayerBoard, PropertyColor, PropertySet } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import { isCompleteSet } from '@monopoly-deal/engine';
import { humanizePlayerIds, nameFor } from '../derivations';
import { collectPendingContested, synthesizeFaceCard, threatKeyForContested } from '../moments/derive';
import type { MomentKind } from '../moments/types';
import type { LogEntry } from '../store/types';
import { theme } from '../theme';
import type { Beat, FeedItem, Fx } from './model';
import { cardName, stateName } from './model';

// ── types ────────────────────────────────────────────────────────────────────

export type Bare<T> = T extends unknown ? Omit<T, 'id'> : never;
export type BeatSpec = Bare<Beat>;
export type FxSpec = Omit<Fx, 'id'>;
export type FeedSpec = Omit<FeedItem, 'id'>;

/** One unit of the queue: a beat (or none, for feed-only news) plus what to say when it is released. */
export interface Step {
  beat?: BeatSpec;
  /** ms the scene holds the stage before the next beat may start (scene length plus a gap). 0 for feed-only steps. */
  wait: number;
  fx?: FxSpec;
  feed: FeedSpec[];
}

/** What later batches need to remember about earlier ones. */
export interface Memory {
  /** Each seat's latest played card: an action still waiting on a target or a Just Say No is played long before it resolves. */
  played: Record<string, Card>;
  /** Discard tops seen so far by card id (a played action is only visible on top of the pile). */
  seen: Record<string, Card>;
  /** Threats aimed at the viewer that already had their `grab` (see `threatKeyForContested`). */
  grabbed: string[];
}

export const emptyMemory = (): Memory => ({ played: {}, seen: {}, grabbed: [] });

// ── pacing ───────────────────────────────────────────────────────────────────

/** Breathing room after a scene, ms. */
export const GAP = 450;
export const TOSS_GAP = 250;
/** No scene is ever cut shorter than this, however deep the backlog. */
export const MIN_WAIT = 200;
/** More than this many beats waiting: the oldest lay/toss beats give up their animation. */
export const QUEUE_CAP = 6;
/** A backlog is compressed so it never takes longer than this to clear. */
export const WAIT_CAP = 5000;

/**
 * How long a beat's scene holds the stage, read off `stage/choreo.ts` (each flight's delay + duration) plus a gap.
 * The camera holds a scene asks for outlast this on purpose; the next beat re-aims the camera itself.
 */
export function sceneMs(b: BeatSpec, me: string): number {
  switch (b.kind) {
    case 'reset':
      return 100;
    case 'deal': {
      const t0 = b.played ? 260 : 0;
      const flights = b.cards.length > 0 ? t0 + (b.cards.length - 1) * 170 + 660 : 0;
      return Math.max(flights, b.played ? 340 : 0) + GAP;
    }
    case 'lay':
      return (b.by === me ? 380 : 620) + GAP;
    case 'loot':
      return 1050 + GAP;
    // The grip stays on the card until the viewer answers; only its arrival is timed.
    case 'grab':
      return 650;
    case 'block':
      return 950 + GAP;
    case 'raid':
      return 1080 + Math.max(0, b.set.cards.length - 1) * 85 + GAP;
    case 'levy': {
      const impact = 320;
      if (b.by !== me) return impact + GAP;
      const isRent = !!b.setId;
      let done = impact;
      b.takes.forEach((tk, i) => {
        if (tk.cards.length === 0) return;
        const hit = impact + 60 + (isRent ? 350 : i * 150);
        done = Math.max(done, hit + 140 + (tk.cards.length - 1) * 90 + 560);
      });
      return done + GAP;
    }
    case 'pay':
      return Math.max(0, b.cards.length - 1) * 90 + 640 + GAP;
    case 'toss':
      return 340 + TOSS_GAP;
  }
}

// ── reading data defensively ─────────────────────────────────────────────────

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const strs = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : undefined);
const colorOf = (v: unknown): PropertyColor | undefined => (typeof v === 'string' && v in SET_SIZES ? (v as PropertyColor) : undefined);
function contestedOf(v: unknown): ContestedAction | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const c = v as Partial<ContestedAction>;
  if (typeof c.type !== 'string' || typeof c.actorId !== 'string') return undefined;
  return { ...c, type: c.type, actorId: c.actorId, payload: c.payload && typeof c.payload === 'object' ? c.payload : {} };
}

const money = (n: number) => theme.formatMoney(n);
const actionLabel = (type: string | undefined) => (!type ? 'play' : type === 'rent' ? 'Rent' : (theme.actionNames[type] ?? 'play'));
const isJsn = (c: Card | null | undefined): c is Card => !!c && c.kind === 'action' && c.action === 'just_say_no';
/** Whether a card is the action (or Rent) of that contested/played type. */
const isType = (c: Card | null | undefined, type: string): c is Card => !!c && (type === 'rent' ? c.kind === 'rent' : c.kind === 'action' && c.action === type);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The face of a contested action's type, for a slam whose real card is no longer to be found. */
const KIND_OF_TYPE: Record<string, MomentKind | undefined> = {
  sly_deal: 'sly_deal',
  forced_deal: 'forced_deal',
  deal_breaker: 'deal_breaker',
  debt_collector: 'debt_collector',
  its_my_birthday: 'birthday',
  rent: 'rent',
  just_say_no: 'just_say_no',
};

// ── finding cards ────────────────────────────────────────────────────────────

interface Found {
  card: Card;
  owner: string;
  kind: 'bank' | 'card' | 'house' | 'hotel';
  set?: PropertySet;
}

function boardsOf(st: ClientGameState): { id: string; board: PlayerBoard }[] {
  return [{ id: st.you.id, board: st.you.board }, ...st.players.filter((p) => p.id !== st.you.id).map((p) => ({ id: p.id, board: p.board }))];
}

/** A card on the public table (any bank or set, buildings included), with whose it is and which set holds it. */
export function locate(st: ClientGameState, cardId: string | undefined): Found | undefined {
  if (!cardId) return undefined;
  for (const { id: owner, board } of boardsOf(st)) {
    for (const c of board.bank) if (c.id === cardId) return { card: c, owner, kind: 'bank' };
    for (const set of board.sets) {
      for (const c of set.cards) if (c.id === cardId) return { card: c, owner, kind: 'card', set };
      if (set.house?.id === cardId) return { card: set.house, owner, kind: 'house', set };
      if (set.hotel?.id === cardId) return { card: set.hotel, owner, kind: 'hotel', set };
    }
  }
  return undefined;
}

/** What a seat could pay with right now: its bank, its properties and their buildings, by value (-1 when the seat is unknown). */
function tableAssets(st: ClientGameState, owner: string): number {
  const b = boardsOf(st).find((x) => x.id === owner)?.board;
  if (!b) return -1;
  const sum = (cards: Card[]) => cards.reduce((n, c) => n + c.value, 0);
  return sum(b.bank) + b.sets.reduce((n, s) => n + sum(s.cards) + (s.house?.value ?? 0) + (s.hotel?.value ?? 0), 0);
}

function findSet(st: ClientGameState, owner: string | undefined, setId: string | undefined): PropertySet | undefined {
  if (!setId) return undefined;
  for (const b of boardsOf(st)) {
    if (owner && b.id !== owner) continue;
    const set = b.board.sets.find((s) => s.id === setId);
    if (set) return set;
  }
  return undefined;
}

const buildingIds = (st: ClientGameState): Set<string> => {
  const ids = new Set<string>();
  for (const { board } of boardsOf(st)) for (const s of board.sets) for (const b of [s.house, s.hotel]) if (b) ids.add(b.id);
  return ids;
};

/** Every card of a set that changes tables with it, buildings included. */
const withBuildings = (set: PropertySet): PropertySet => ({ ...set, cards: [...set.cards, ...(set.house ? [set.house] : []), ...(set.hotel ? [set.hotel] : [])] });

// ── one batch: entries + (prev → next) → steps ───────────────────────────────

const FORFEIT_KINDS = new Set(['sly_deal_target', 'forced_deal_target', 'deal_breaker_target', 'debt_collector_target', 'rent_color_choice', 'rent_player_choice', 'house_hotel_target']);
const LEVY_CONTESTED = { rent_charged: 'rent', birthday: 'its_my_birthday', debt_collector: 'debt_collector' } as const;

export interface DeriveResult {
  steps: Step[];
  memory: Memory;
}

/**
 * The steps a batch of fresh entries adds up to. `prev` is the projection before the batch and `next` the one after
 * it (the same object on a flush with no projection to diff, where cards can only be found on the table).
 */
export function deriveSteps(entries: readonly LogEntry[], prev: ClientGameState, next: ClientGameState, memory: Memory): DeriveResult {
  const me = next.viewerId;
  const mem: Memory = { played: { ...memory.played }, seen: { ...memory.seen }, grabbed: [...memory.grabbed] };
  const steps: Step[] = [];
  const known = new Set([next.you.id, ...next.players.map((p) => p.id)]);

  const who = (id: string) => (id === me ? 'You' : nameFor(next, id));
  /** A seat inside a sentence: "you" for the viewer. */
  const them = (id: string) => (id === me ? 'you' : nameFor(next, id));
  const possessive = (id: string) => (id === me ? 'your' : `${nameFor(next, id)}'s`);
  const ownTone = (id: string): FeedItem['tone'] => (id === me ? 'you' : 'rival');
  /** good = it favours the viewer, bad = it is against them, otherwise a rival's business. */
  const sideTone = (actor: string, victim?: string): FeedItem['tone'] => (actor === me ? 'good' : victim === me ? 'bad' : 'rival');

  // What the viewer's hand lost and gained over the batch.
  const prevHand = new Map(prev.you.hand.map((c) => [c.id, c]));
  const nextHandIds = new Set(next.you.hand.map((c) => c.id));
  const goneHand = prev.you.hand.filter((c) => !nextHandIds.has(c.id));
  const newHand = next.you.hand.filter((c) => !prevHand.has(c.id));
  const claimed = new Set<string>();
  const oldBuildings = buildingIds(prev);
  const done = new Set<LogEntry>();
  const completed = new Set<string>();
  for (const e of entries) {
    const id = e.type === 'set_completed' ? str(e.data?.setId) : undefined;
    if (id) completed.add(id);
  }

  for (const c of [prev.discardTop, next.discardTop]) if (c) mem.seen[c.id] = c;
  const seenIds = Object.keys(mem.seen);
  for (const id of seenIds.slice(0, Math.max(0, seenIds.length - 16))) delete mem.seen[id];

  const add = (s: { beat?: BeatSpec; fx?: FxSpec; feed?: FeedSpec[] }) => {
    const step: Step = { beat: s.beat, fx: s.fx, feed: s.feed ?? [], wait: s.beat ? sceneMs(s.beat, me) : 0 };
    const last = steps[steps.length - 1];
    // News with no scene of its own rides on the step before it, so the HUD line and the stage stay in step.
    if (!step.beat && last) {
      last.feed.push(...step.feed);
      if (step.fx) last.fx = step.fx;
      return;
    }
    steps.push(step);
  };

  const claim = (c: Card | undefined) => {
    if (c) claimed.add(c.id);
    return c;
  };

  /** A card someone just played out of their hand: the real one when it can be found. */
  const playedCard = (id: string | undefined, actor: string): Card | undefined => {
    if (!id) return undefined;
    return (actor === me ? prevHand.get(id) : undefined) ?? (next.discardTop?.id === id ? next.discardTop : undefined) ?? mem.seen[id] ?? locate(next, id)?.card ?? locate(prev, id)?.card;
  };

  /** The card of `type` that `actor` played and that is still resolving (or just resolved). */
  const recall = (actor: string, type: string): Card | undefined => {
    const remembered = mem.played[actor];
    if (isType(remembered, type)) return remembered;
    if (isType(next.discardTop, type)) return next.discardTop;
    return actor === me ? goneHand.find((c) => isType(c, type) && !claimed.has(c.id)) : undefined;
  };
  /** `recall`, else the face of that action type (public information) so the slam still has a card. */
  const faceFor = (actor: string, type: string): Card | undefined => {
    const k = KIND_OF_TYPE[type];
    return recall(actor, type) ?? (k ? (synthesizeFaceCard(k) ?? undefined) : undefined);
  };

  const dealFor = (n: number | undefined): Card[] => (prev === next ? [] : newHand.splice(0, n ?? newHand.length));

  const payDetail = (e: LogEntry) => {
    const payer = e.playerId;
    const payee = str(e.data?.payeeId);
    if (!payer || !payee || !known.has(payer) || !known.has(payee)) return undefined;
    const total = num(e.data?.total) ?? 0;
    const ids = strs(e.data?.cardIds) ?? [];
    const cards = ids.map((id) => locate(next, id)?.card).filter((c): c is Card => !!c);
    return { payer, payee, total, cards };
  };
  /** The stamp and the line a payment leaves, whether it has a scene of its own or rode in on a levy. */
  const payNews = ({ payer, payee, total }: { payer: string; payee: string; total: number }): { fx?: FxSpec; feed: FeedSpec[] } => ({
    fx: payer === me ? { kind: 'pay', text: `Paid ${money(total)}`, amount: total } : payee === me ? { kind: 'collect', text: `+${money(total)}`, amount: total } : undefined,
    feed: [
      payer === me
        ? { tone: 'bad', who: 'You', text: `paid ${them(payee)} ${money(total)}` }
        : payee === me
          ? { tone: 'good', who: who(payer), text: `paid you ${money(total)}` }
          : { tone: 'rival', who: who(payer), text: `paid ${them(payee)} ${money(total)}` },
    ],
  });

  for (const e of entries) {
    if (done.has(e)) continue;
    const actor = e.playerId && known.has(e.playerId) ? e.playerId : undefined;
    const mine = actor === me;
    /** An event missing what its beat needs still gets its line, in the engine's own words. */
    const say = () => add({ feed: [{ tone: actor ? ownTone(actor) : 'sys', who: '', text: humanizePlayerIds(next, e.message) }] });

    switch (e.type) {
      // ── the turn ──
      case 'cards_drawn': {
        if (!actor || !mine) break;
        const count = num(e.data?.count);
        const cards = dealFor(count);
        const n = cards.length || (count ?? 0);
        add({
          beat: cards.length ? { kind: 'deal', to: me, cards } : undefined,
          fx: n ? { kind: 'draw', text: `+${n} cards`, amount: n } : undefined,
          feed: [{ tone: 'you', who: 'You', text: n ? `drew ${plural(n, 'card')}` : 'drew cards' }],
        });
        break;
      }
      case 'turn_ended': {
        if (!actor) break;
        const order = next.players.map((p) => p.id);
        const to = order[(order.indexOf(actor) + 1) % Math.max(1, order.length)];
        add({ feed: [{ tone: 'sys', who: '', text: to === me ? 'Your turn' : to ? `${nameFor(next, to)}'s turn` : 'Next turn' }] });
        break;
      }
      case 'deck_reshuffled':
        add({ feed: [{ tone: 'sys', who: '', text: 'Discard pile reshuffled into the deck' }] });
        break;
      case 'player_connection': {
        // Your own link coming and going is the connection banner's business, not the table's.
        if (actor && !mine) add({ feed: [{ tone: 'sys', who: who(actor), text: e.data?.connected === false ? 'is away' : 'is back' }] });
        break;
      }
      case 'discarded': {
        if (mine) add({ feed: [{ tone: 'sys', who: '', text: `Hand limit — discard ${num(e.data?.count) ?? ''}`.trim() }] });
        break;
      }
      case 'turn_resumed': {
        if (actor) add({ feed: [{ tone: ownTone(actor), who: who(actor), text: 'kept playing' }] });
        break;
      }
      case 'hand_limit_discard': {
        if (!actor) break;
        const n = num(e.data?.count) ?? 1;
        const line: FeedSpec = { tone: ownTone(actor), who: who(actor), text: `discarded ${plural(n, 'card')}` };
        if (mine) {
          const cards = goneHand.filter((c) => !claimed.has(c.id)).slice(-n);
          if (cards.length === 0) add({ feed: [line] });
          cards.forEach((c, i) => {
            claim(c);
            add({ beat: { kind: 'toss', by: me, card: c }, feed: i === 0 ? [line] : [] });
          });
        } else {
          // Their cards are public once thrown, but only the top of the pile is in the projection.
          const top = next.discardTop && !claimed.has(next.discardTop.id) ? claim(next.discardTop) : undefined;
          add({ beat: top ? { kind: 'toss', by: actor, card: top } : undefined, feed: [line] });
        }
        break;
      }

      // ── plays out of the hand ──
      case 'card_played': {
        if (!actor) break;
        const id = str(e.data?.cardId);
        if (id) {
          // An action or rent card on its way to a target or a Just Say No window: remember it for when that resolves.
          const card = claim(playedCard(id, actor));
          if (card) mem.played[actor] = card;
          break;
        }
        // No card id: the engine's "nothing to do with it" plays (a rent with no matching set, a Deal Breaker with no target).
        const wasted = /rent/i.test(e.message)
          ? mine
            ? goneHand.find((c) => c.kind === 'rent' && !claimed.has(c.id))
            : next.discardTop?.kind === 'rent'
              ? next.discardTop
              : undefined
          : mem.played[actor];
        claim(wasted);
        add({
          beat: wasted ? { kind: 'toss', by: actor, card: wasted } : undefined,
          feed: [{ tone: ownTone(actor), who: who(actor), text: wasted ? `wasted ${cardName(wasted)}` : 'wasted a card' }],
        });
        break;
      }
      case 'card_banked': {
        if (!actor) break;
        const id = str(e.data?.cardId);
        const found = locate(next, id);
        const card = claim(found?.kind === 'bank' ? found.card : playedCard(id, actor));
        add({
          beat: card ? { kind: 'lay', by: actor, card, into: 'bank' } : undefined,
          fx: mine && card ? { kind: 'bank', text: `+${money(card.value)}`, amount: card.value } : undefined,
          feed: [{ tone: ownTone(actor), who: who(actor), text: card ? `banked ${cardName(card)}${card.kind === 'money' ? '' : ` (${money(card.value)})`}` : 'banked a card' }],
        });
        break;
      }
      case 'property_placed': {
        if (!actor) break;
        const id = str(e.data?.cardId);
        const found = locate(next, id);
        const card = claim(found?.card ?? (mine && id ? prevHand.get(id) : undefined));
        const setId = found?.set?.id ?? str(e.data?.setId);
        const color = colorOf(e.data?.color) ?? found?.set?.color;
        const finished = !!setId && completed.has(setId);
        const state = color ? stateName(color) : 'a set';
        const name = !card ? 'a property' : card.kind === 'property_wild' ? `Wild as ${state}` : cardName(card);
        add({
          beat: card && setId ? { kind: 'lay', by: actor, card, into: 'set', setId, completed: finished } : undefined,
          fx: mine
            ? finished
              ? { kind: 'set', text: `${state} complete!`, color }
              : { kind: 'build', text: card?.kind === 'property_wild' ? `${state} +1` : card ? cardName(card) : state, color }
            : undefined,
          feed: [{ tone: mine && finished ? 'good' : ownTone(actor), who: who(actor), text: `played ${name}${finished ? ` — ${state} complete!` : ''}` }],
        });
        break;
      }
      case 'house_placed':
      case 'hotel_placed': {
        if (!actor) break;
        const kind = e.type === 'house_placed' ? 'house' : 'hotel';
        // The engine's message is all there is: the new building on the actor's table, else the card they played.
        const fresh = boardsOf(next)
          .filter((b) => b.id === actor)
          .flatMap((b) => b.board.sets.map((s) => ({ set: s, card: kind === 'house' ? s.house : s.hotel })))
          .find((x) => x.card && !oldBuildings.has(x.card.id));
        const remembered = mem.played[actor];
        const homed = remembered ? locate(next, remembered.id) : undefined;
        const set = fresh?.set ?? homed?.set;
        const card = claim(fresh?.card ?? homed?.card);
        add({
          beat: card && set ? { kind: 'lay', by: actor, card, into: 'set', setId: set.id } : undefined,
          fx: mine ? { kind: 'build', text: kind === 'house' ? 'House' : 'Hotel', color: set?.color } : undefined,
          feed: [{ tone: ownTone(actor), who: who(actor), text: `built a ${kind === 'house' ? 'House' : 'Hotel'} on ${set ? stateName(set.color) : 'a set'}` }],
        });
        break;
      }
      case 'pass_go': {
        if (!actor) break;
        const played = claim(recall(actor, 'pass_go'));
        const cards = mine ? dealFor(num(e.data?.count)) : [];
        const n = mine ? cards.length || (num(e.data?.count) ?? 0) : 0;
        // A rival's cards come off the deck unseen: only the Pass Go itself is thrown.
        const beat: BeatSpec | undefined =
          mine && cards.length ? { kind: 'deal', to: me, cards, ...(played ? { played } : {}) } : played ? { kind: 'toss', by: actor, card: played } : undefined;
        add({
          beat,
          fx: n ? { kind: 'draw', text: `+${n} cards`, amount: n } : undefined,
          feed: [{ tone: ownTone(actor), who: who(actor), text: 'played Pass Go' }],
        });
        break;
      }
      case 'double_the_rent': {
        if (!actor) break;
        const played = claim(recall(actor, 'double_the_rent'));
        add({
          beat: played ? { kind: 'toss', by: actor, card: played } : undefined,
          feed: [{ tone: ownTone(actor), who: who(actor), text: 'played Double the Rent' }],
        });
        break;
      }

      // ── attacks that resolve ──
      case 'sly_deal': {
        if (!actor) break;
        const victim = str(e.data?.targetPlayerId);
        if (!victim || !known.has(victim)) {
          say();
          break;
        }
        const found = locate(next, str(e.data?.cardId));
        const card = found?.card;
        const played = faceFor(actor, 'sly_deal');
        const name = card ? cardName(card) : 'a property';
        const color = card?.kind === 'property' ? card.color : found?.set?.color;
        add({
          beat: card && found?.set && played ? { kind: 'loot', by: actor, from: victim, card, setId: found.set.id, played, label: 'SLY DEAL' } : undefined,
          fx: mine ? { kind: 'steal', text: `Stole ${name}`, color } : victim === me ? { kind: 'stolen', text: `${who(actor)} stole ${name}`, color } : undefined,
          feed: [{ tone: sideTone(actor, victim), who: who(actor), text: victim === me ? `stole your ${name}` : `Sly Dealt ${name} from ${them(victim)}` }],
        });
        break;
      }
      case 'forced_deal': {
        if (!actor) break;
        const victim = str(e.data?.targetPlayerId);
        if (!victim || !known.has(victim)) {
          say();
          break;
        }
        const theirs = locate(next, str(e.data?.targetCardId));
        const own = locate(next, str(e.data?.ownCardId));
        const played = faceFor(actor, 'forced_deal');
        const got = theirs ? cardName(theirs.card) : 'a property';
        const gave = own ? cardName(own.card) : 'a property';
        const color = theirs?.card.kind === 'property' ? theirs.card.color : theirs?.set?.color;
        add({
          beat: theirs?.set && played ? { kind: 'loot', by: actor, from: victim, card: theirs.card, setId: theirs.set.id, played, label: 'FORCED DEAL' } : undefined,
          fx: mine ? { kind: 'steal', text: `Swapped for ${got}`, color } : victim === me ? { kind: 'stolen', text: `${who(actor)} took ${got}`, color } : undefined,
          feed: [{ tone: sideTone(actor, victim), who: who(actor), text: victim === me ? `swapped their ${gave} for your ${got}` : `swapped ${gave} for ${possessive(victim)} ${got}` }],
        });
        // The other half of the swap: a second card changes hands, staged as a handing-over.
        if (own && own.owner === victim) add({ beat: { kind: 'pay', by: actor, to: victim, cards: [own.card], label: 'SWAP' } });
        break;
      }
      case 'deal_breaker': {
        if (!actor) break;
        const victim = str(e.data?.targetPlayerId);
        if (!victim || !known.has(victim)) {
          say();
          break;
        }
        const color = colorOf(e.data?.color);
        const played = faceFor(actor, 'deal_breaker');
        // The set got a fresh id on its new table: find it by its cards, else by colour.
        const set =
          strs(e.data?.cardIds)
            ?.map((id) => locate(next, id))
            .find((f) => f?.set && f.owner === actor)?.set ??
          boardsOf(next)
            .find((b) => b.id === actor)
            ?.board.sets.find((s) => color && s.color === color && isCompleteSet(s));
        const c = set?.color ?? color;
        const state = c ? stateName(c) : 'a set';
        add({
          beat: set && played ? { kind: 'raid', by: actor, from: victim, set: withBuildings(set), played, label: 'DEAL BREAKER' } : undefined,
          fx: mine ? { kind: 'steal', text: `Took ${state}`, color: c } : undefined,
          feed: [{ tone: sideTone(actor, victim), who: who(actor), text: `took ${possessive(victim)} ${state} — Deal Breaker!` }],
        });
        break;
      }

      // ── money owed and paid ──
      case 'rent_charged':
      case 'birthday':
      case 'debt_collector': {
        if (!actor) break;
        // One levy per play, however many payers it names.
        const group = entries.filter((x) => x.type === e.type && x.playerId === actor && !done.has(x));
        for (const x of group) done.add(x);
        const type = LEVY_CONTESTED[e.type];
        const payers = [...new Set(group.map((x) => str(x.data?.payerId)).filter((id): id is string => !!id && known.has(id)))];
        const amount = num(group[0]?.data?.amount) ?? (type === 'debt_collector' ? 5 : type === 'its_my_birthday' ? 2 : 0);
        const played = claim(faceFor(actor, type));
        const rentColor = type === 'rent' ? colorOf(group[0]?.data?.color) : undefined;
        const set = rentColor ? boardsOf(next).find((b) => b.id === actor)?.board.sets.find((s) => s.color === rentColor && s.cards.length > 0) : undefined;
        // Payments settled inside the same batch travel with the levy; later ones arrive as their own `pay`.
        const settled: LogEntry[] = [];
        const takes = payers.flatMap((payer) => {
          const paid = entries.filter((x) => x.type === 'payment_made' && x.playerId === payer && str(x.data?.payeeId) === actor && !done.has(x));
          // A payer with nothing on the table is never asked to pay (the engine skips the payment): it is a "BROKE!" on the stage.
          if (paid.length === 0) return tableAssets(prev, payer) === 0 ? [{ from: payer, owed: amount, cards: [] as Card[] }] : [];
          paid.forEach((x) => done.add(x));
          settled.push(...paid);
          return [{ from: payer, owed: amount, cards: paid.flatMap((x) => payDetail(x)?.cards ?? []) }];
        });
        // A card that charges everyone skips the rivals with nothing to pay with, and never names them: they are BROKE too.
        if (type === 'its_my_birthday' || (played?.kind === 'rent' && played.rentType === 'dual')) {
          for (const { id } of boardsOf(next)) {
            if (id !== actor && !payers.includes(id) && tableAssets(prev, id) === 0) takes.push({ from: id, owed: amount, cards: [] });
          }
        }
        const aimed = payers.length === 1 ? payers[0] : undefined;
        const owesMe = payers.includes(me);
        const names = payers.map(them).join(' & ');
        const label =
          type === 'rent' ? `RENT ${money(amount)}` : type === 'its_my_birthday' ? (mine ? 'HAPPY BIRTHDAY!' : `BIRTHDAY ${money(amount)}`) : mine ? 'DEBT COLLECTOR' : `DEBT ${money(amount)}`;
        const text = mine
          ? type === 'rent'
            ? `charged ${money(amount)} rent${rentColor ? ` on ${stateName(rentColor)}` : ''}`
            : type === 'its_my_birthday'
              ? "played It's My Birthday"
              : `demanded ${money(amount)} from ${names}`
          : type === 'rent'
            ? owesMe
              ? `charges you ${money(amount)} rent`
              : `charges ${names} ${money(amount)} rent`
            : type === 'its_my_birthday'
              ? owesMe
                ? `played It's My Birthday — you owe ${money(amount)}`
                : "played It's My Birthday"
              : owesMe
                ? `plays Debt Collector — you owe ${money(amount)}`
                : `demands ${money(amount)} from ${names}`;
        add({
          // A Debt Collector with no known target has nowhere to land.
          beat: played && (type !== 'debt_collector' || aimed) ? { kind: 'levy', by: actor, played, label, ...(set ? { setId: set.id } : {}), takes, ...(aimed ? { aimed } : {}) } : undefined,
          feed: [{ tone: mine ? 'good' : owesMe ? 'bad' : 'rival', who: who(actor), text }],
        });
        for (const x of settled) {
          const d = payDetail(x);
          if (d) add(payNews(d));
        }
        break;
      }
      case 'payment_made': {
        const d = payDetail(e);
        if (!d) {
          say();
          break;
        }
        const { payer, payee, total, cards } = d;
        const label = payer === me ? `−${money(total)}` : payee === me ? `+${money(total)}` : money(total);
        add({ beat: cards.length ? { kind: 'pay', by: payer, to: payee, cards, label } : undefined, ...payNews(d) });
        break;
      }
      case 'set_broken': {
        if (!actor) break;
        const color = colorOf(e.data?.color);
        add({ feed: [{ tone: mine ? 'bad' : 'rival', who: who(actor), text: `${color ? `${stateName(color)} ` : ''}set broke` }] });
        break;
      }

      // ── Just Say No ──
      case 'just_say_no': {
        if (!actor) break;
        // What is being contested: the cancelled/pending action the engine attached, else the pending stack on either side.
        const named = str(e.data?.contestedActorId);
        const contested = entries.map((x) => contestedOf(x.data?.contested)).find((c) => c && c.actorId === named) ?? collectPendingContested(prev).find((p) => p.respondentId === actor)?.contestedAction ?? collectPendingContested(next).find((p) => p.respondentId === actor)?.contestedAction;
        const type = str(e.data?.contestedType) ?? contested?.type;
        const from = named ?? contested?.actorId;
        const target = str(e.data?.contestedTargetId) ?? contested?.targetPlayerId;
        const counter = (num(e.data?.chain) ?? 1) >= 2;
        const against = actor === from ? target : from;
        const jsn = claim((mine ? goneHand.find((c) => isJsn(c) && !claimed.has(c.id)) : undefined) ?? (isJsn(next.discardTop) ? next.discardTop : (synthesizeFaceCard('just_say_no') ?? undefined)));
        const label = actionLabel(type);

        // What the Just Say No lands on: the card at stake, else the play that started it.
        const p = contested?.payload ?? {};
        const victim = str(p.targetPlayerId) ?? contested?.targetPlayerId;
        const stake =
          contested?.type === 'sly_deal' || contested?.type === 'forced_deal'
            ? (locate(next, str(p.targetCardId)) ?? locate(prev, str(p.targetCardId)))?.card
            : contested?.type === 'deal_breaker'
              ? (findSet(next, victim, str(p.targetSetId)) ?? findSet(prev, victim, str(p.targetSetId)))?.cards[0]
              : undefined;
        const onCard = stake ?? (from && type ? faceFor(from, type) : undefined);
        // The stage shows a Just Say No the viewer plays, or one played against the viewer's own play; the rest is a card thrown.
        const staged = !!jsn && !!against && !!onCard && (mine || from === me);

        add({
          beat: staged ? { kind: 'block', by: actor, against, played: jsn, card: onCard, label: 'JUST SAY NO!' } : jsn ? { kind: 'toss', by: actor, card: jsn } : undefined,
          fx: mine ? { kind: 'jsn', text: 'Just Say No!' } : undefined,
          feed: [
            {
              tone: mine ? 'good' : from === me || target === me ? 'bad' : 'rival',
              who: who(actor),
              text: counter ? 'said NO right back!' : `said NO to ${!from ? 'their' : from === actor ? 'their own' : possessive(from)} ${label}`,
            },
          ],
        });
        break;
      }
      case 'just_say_no_declined': {
        if (mine) add({ feed: [{ tone: 'you', who: 'You', text: 'let it through' }] });
        break;
      }
      case 'action_cancelled': {
        if (e.data?.forced === true) {
          // A choice that ran out of time: the card was already on the pile.
          const kind = str(e.data?.kind);
          const played = actor && kind && FORFEIT_KINDS.has(kind) ? claim(mem.played[actor]) : undefined;
          add({
            beat: actor && played ? { kind: 'toss', by: actor, card: played } : undefined,
            feed: [{ tone: 'sys', who: '', text: actor ? `${who(actor)} ran out of time` : 'Ran out of time' }],
          });
          break;
        }
        const contested = contestedOf(e.data?.contested);
        // The Just Say No that cancelled it has already said so.
        if (contested && entries.some((x) => x.type === 'just_say_no')) break;
        add({
          feed: [
            contested
              ? { tone: contested.actorId === me ? 'bad' : contested.targetPlayerId === me ? 'good' : 'sys', who: '', text: `${actionLabel(contested.type)} cancelled` }
              : { tone: 'sys', who: '', text: humanizePlayerIds(next, e.message) },
          ],
        });
        break;
      }

      // ── the rest of the story ──
      case 'rearranged': {
        if (!actor) break;
        const m = /rearranged (\S+) to (\S+)$/.exec(e.message);
        const found = locate(next, m?.[1]);
        const color = colorOf(m?.[2]);
        add({ feed: [{ tone: ownTone(actor), who: who(actor), text: `moved ${found ? cardName(found.card) : 'a card'}${color ? ` to ${stateName(color)}` : ''}` }] });
        break;
      }
      case 'winner': {
        if (!actor) break;
        const n = num(e.data?.setCount) ?? 3;
        add({
          fx: mine ? { kind: 'win', text: n === 3 ? 'Three sets!' : `${n} sets!` } : undefined,
          feed: [{ tone: mine ? 'good' : 'bad', who: who(actor), text: mine ? `won with ${n} sets!` : `wins with ${n} sets` }],
        });
        break;
      }
      // Folded into the property that completed the set / the new deal.
      case 'set_completed':
      case 'game_started':
        break;
      default:
        if (e.message) add({ feed: [{ tone: 'sys', who: '', text: humanizePlayerIds(next, e.message) }] });
    }
  }

  // ── a rival's Sly Deal, Forced Deal or Deal Breaker with a hand on your card, waiting on your Just Say No ──
  const live = new Set<string>();
  for (const { contestedAction: c, respondentId } of collectPendingContested(next)) {
    const key = threatKeyForContested(c);
    if (!key) continue;
    live.add(key);
    if (respondentId !== me || c.actorId === me || mem.grabbed.includes(key)) continue;
    if (c.type !== 'sly_deal' && c.type !== 'forced_deal' && c.type !== 'deal_breaker') continue;
    mem.grabbed.push(key);
    const p = c.payload ?? {};
    const set = c.type === 'deal_breaker' ? findSet(next, me, str(p.targetSetId)) : undefined;
    const card = set ? set.cards[0] : locate(next, str(p.targetCardId))?.card;
    const played = faceFor(c.actorId, c.type);
    const label = c.type === 'sly_deal' ? 'SLY DEAL' : c.type === 'forced_deal' ? 'FORCED DEAL' : 'DEAL BREAKER';
    add({
      beat: card && played ? { kind: 'grab', by: c.actorId, from: me, card, played, label } : undefined,
      feed: [{ tone: 'bad', who: who(c.actorId), text: set ? `plays Deal Breaker on your ${stateName(set.color)}` : `plays ${actionLabel(c.type)} on your ${card ? cardName(card) : 'property'}` }],
    });
  }
  mem.grabbed = mem.grabbed.filter((k) => live.has(k));

  return { steps, memory: mem };
}

// ── the queue ────────────────────────────────────────────────────────────────

/** What `useLiveEvents` keeps between renders. Every transition below is pure, so it can be driven without React. */
export interface LiveState {
  /** The inputs last folded in (identity), so a render with nothing new changes nothing. */
  seenLog: readonly LogEntry[] | null;
  seenState: ClientGameState | null;
  /** Whether a game has been on screen before: a re-baseline after that clears the stage. */
  started: boolean;
  lastLogId: number;
  /** The projection the fresh events are diffed against; null until the first one arrives (the baseline). */
  prev: ClientGameState | null;
  /** Entries that have arrived but whose projection has not. */
  held: LogEntry[];
  mem: Memory;
  /** Shared by beats, stamps and feed lines, so every id is unique and increasing. */
  seq: number;
  queue: Step[];
  /** ms the beat now on stage holds it before the next may start; 0 when nothing is playing. */
  playing: number;
  /** How much the queued waits are compressed so a backlog clears within `WAIT_CAP` (1 = not at all). */
  squeeze: number;
  /** Changes with every release that starts a scene: timers key on it. */
  token: number;
  beat: Beat | null;
  fx: Fx | null;
  feed: FeedItem[];
}

export const FEED_CAP = 60;

export const initialLive = (): LiveState => ({
  seenLog: null,
  seenState: null,
  started: false,
  lastLogId: 0,
  prev: null,
  held: [],
  mem: emptyMemory(),
  seq: 0,
  queue: [],
  playing: 0,
  squeeze: 1,
  token: 0,
  beat: null,
  fx: null,
  feed: [],
});

/** Pending threats already on the table when a baseline is taken: they are not acted out again. */
function threatKeys(st: ClientGameState): string[] {
  return collectPendingContested(st)
    .filter((p) => p.respondentId === st.viewerId && p.contestedAction.actorId !== st.viewerId)
    .flatMap((p) => threatKeyForContested(p.contestedAction) ?? []);
}

/** Drops the oldest lay/toss beats when too many are waiting; their feed lines stay. */
function trim(queue: Step[]): Step[] {
  let carrying = queue.filter((s) => s.beat).length;
  if (carrying <= QUEUE_CAP) return queue;
  return queue.map((s) => {
    if (carrying > QUEUE_CAP && s.beat && (s.beat.kind === 'lay' || s.beat.kind === 'toss')) {
      carrying -= 1;
      return { ...s, beat: undefined, wait: 0 };
    }
    return s;
  });
}

/** Starts the next scene: applies each queued step's feed and stamp up to and including the first that carries a beat. */
function advance(s: LiveState): LiveState {
  const queue = [...s.queue];
  let { seq, feed, fx } = s;
  let beat: Beat | null = null;
  let playing = 0;
  while (queue.length > 0) {
    const step = queue.shift()!;
    for (const f of step.feed) feed = [...feed, { id: ++seq, ...f }];
    if (step.fx) fx = { id: ++seq, ...step.fx };
    if (step.beat) {
      beat = { id: ++seq, ...step.beat } as Beat;
      playing = Math.max(MIN_WAIT, Math.round(step.wait * s.squeeze));
      break;
    }
  }
  return { ...s, queue, seq, feed: feed.slice(-FEED_CAP), fx, beat, playing, squeeze: queue.length > 0 ? s.squeeze : 1, token: beat ? s.token + 1 : s.token };
}

/** The scene on stage has had its time: start the next one, or clear the stage. A stale timer (old token) is ignored. */
export function release(s: LiveState, token = s.token): LiveState {
  if (token !== s.token) return s;
  return advance({ ...s, beat: null, playing: 0 });
}

/** A clean slate for a new game (or seat): the stage is cleared with a `reset` beat and the feed starts over. */
function restart(s: LiveState, state: ClientGameState, maxId: number): LiveState {
  const seq = s.seq + 1;
  return {
    ...s,
    started: true,
    prev: state,
    lastLogId: maxId,
    held: [],
    mem: { ...emptyMemory(), grabbed: threatKeys(state) },
    queue: [],
    squeeze: 1,
    feed: [],
    fx: null,
    seq,
    beat: { id: seq, kind: 'reset' },
    playing: sceneMs({ kind: 'reset' }, state.viewerId),
    token: s.token + 1,
  };
}

/** Derives the held entries against `state` and queues what they add up to. */
function settle(s: LiveState, state: ClientGameState): LiveState {
  const { steps, memory } = deriveSteps(s.held, s.prev ?? state, state, s.mem);
  const queue = trim([...s.queue, ...steps]);
  // A backlog is compressed evenly so that it clears in bounded time, however many commands landed at once.
  const total = queue.reduce((n, q) => n + (q.beat ? q.wait : 0), 0);
  const next: LiveState = { ...s, prev: state, held: [], mem: memory, queue, squeeze: Math.min(1, WAIT_CAP / Math.max(1, total)) };
  // Idle: the first scene starts in this very render, in the same commit as the state that moved. Otherwise it queues.
  return next.playing === 0 && next.beat === null ? advance(next) : next;
}

/**
 * Folds the store's latest log and projection in. Events arrive before the projection with their result, so fresh
 * entries wait (`held`) until the projection changes, then are derived against the diff. The first projection after
 * mount is only a baseline: nothing that came before it is replayed.
 */
export function ingest(s: LiveState, log: readonly LogEntry[], state: ClientGameState | null): LiveState {
  if (s.seenLog === log && s.seenState === state) return s;
  const seen: LiveState = { ...s, seenLog: log, seenState: state };
  const maxId = log.length > 0 ? log[log.length - 1]!.id : 0;

  // No projection (seat switch, new deal, not connected yet): nothing to show against; the next one is a baseline.
  if (!state) return { ...seen, prev: null, held: [], queue: [], squeeze: 1, beat: null, playing: 0 };

  // First projection ever: a silent baseline. Any later one after a gap, or for another seat, starts the stage over.
  if (!s.prev || s.prev.viewerId !== state.viewerId) {
    if (!s.started) return { ...seen, started: true, prev: state, lastLogId: maxId, held: [], mem: { ...emptyMemory(), grabbed: threatKeys(state) } };
    return restart(seen, state, maxId);
  }

  // A log that shrank restarted: a new game.
  if (maxId < s.lastLogId) return restart(seen, state, maxId);

  const fresh = log.filter((e) => e.id > s.lastLogId);
  const held = fresh.length > 0 ? [...s.held, ...fresh] : s.held;
  const base: LiveState = { ...seen, lastLogId: maxId, held };
  if (state === s.prev) return base;

  // A fresh deal inside the same session announces itself.
  if (held.some((e) => e.type === 'game_started')) return restart(base, state, maxId);

  return settle(base, state);
}

/** Entries whose projection never came: derive them against what is on screen rather than hold them forever. */
export function flush(s: LiveState): LiveState {
  if (s.held.length === 0 || !s.prev) return s;
  return settle(s, s.prev);
}

/** Runs a state to quiescence, collecting every beat in order with the ms it held the stage. For tests and for measuring a queue. */
export function drain(s: LiveState): { state: LiveState; beats: Beat[]; waits: number[] } {
  const beats: Beat[] = [];
  const waits: number[] = [];
  let cur = s;
  for (let i = 0; i < 200; i++) {
    if (cur.beat) {
      beats.push(cur.beat);
      waits.push(cur.playing);
    }
    if (cur.playing === 0 && cur.queue.length === 0) break;
    cur = release(cur);
  }
  return { state: cur, beats, waits };
}
