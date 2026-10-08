/**
 * What every entry handler of one batch shares: the two projections, the working memory, the output steps, and the
 * bookkeeping (cards already claimed by a beat, entries already folded into another) plus the phrasing and card-finding
 * helpers built on them. `makeContext` sets it all up before the first entry is read.
 */
import type { Card, ClientGameState } from '@monopoly-deal/shared';
import { nameFor } from '../../derivations';
import { synthesizeFaceCard } from '../../moments/derive';
import type { LogEntry } from '../../store/types';
import type { FeedItem } from '../model';
import { KIND_OF_TYPE, buildingIds, isType, locate, money, num, str, strs } from './helpers';
import type { BeatSpec, FeedSpec, FxSpec, Memory, Step } from './step';
import { sceneMs } from './step';

interface PayDetail {
  payer: string;
  payee: string;
  total: number;
  cards: Card[];
  /** The server tagged this payment as the deadline firing, not a tap on PAY — see `room.ts`'s `TIMEOUT_COMMANDS`. */
  timeout: boolean;
}

/** One batch's shared state and helpers (see `makeContext`). */
export interface DeriveCtx {
  entries: readonly LogEntry[];
  prev: ClientGameState;
  next: ClientGameState;
  /** The viewer's seat id. */
  me: string;
  mem: Memory;
  steps: Step[];
  /** Every seat id at the table. */
  known: Set<string>;
  who: (id: string) => string;
  /** A seat inside a sentence: "you" for the viewer. */
  them: (id: string) => string;
  possessive: (id: string) => string;
  ownTone: (id: string) => FeedItem['tone'];
  /** good = it favours the viewer, bad = it is against them, otherwise a rival's business. */
  sideTone: (actor: string, victim?: string) => FeedItem['tone'];
  prevHand: Map<string, Card>;
  goneHand: Card[];
  claimed: Set<string>;
  oldBuildings: Set<string>;
  /** Entries already folded into an earlier one's step. */
  done: Set<LogEntry>;
  /** Set ids the batch completes. */
  completed: Set<string>;
  add: (s: { beat?: BeatSpec; fx?: FxSpec; feed?: FeedSpec[] }) => void;
  claim: (c: Card | undefined) => Card | undefined;
  /** A card someone just played out of their hand: the real one when it can be found. */
  playedCard: (id: string | undefined, actor: string) => Card | undefined;
  /** The card of `type` that `actor` played and that is still resolving (or just resolved). */
  recall: (actor: string, type: string) => Card | undefined;
  /** `recall`, else the face of that action type (public information) so the slam still has a card. */
  faceFor: (actor: string, type: string) => Card | undefined;
  dealFor: (n: number | undefined) => Card[];
  payDetail: (e: LogEntry) => PayDetail | undefined;
  /** The stamp and the line a payment leaves, whether it has a scene of its own or rode in on a levy. */
  payNews: (d: { payer: string; payee: string; total: number; timeout?: boolean }) => { fx?: FxSpec; feed: FeedSpec[] };
}

/** The entry being read, as its handler sees it. */
export interface EntryCtx {
  e: LogEntry;
  /** The entry's seat, when it is one at the table. */
  actor: string | undefined;
  mine: boolean;
  /** An event missing what its beat needs still gets its line, in the engine's own words. */
  say: () => void;
}

/**
 * Sets up one batch. `prev` is the projection before the batch and `next` the one after it (the same object on a
 * flush with no projection to diff, where cards can only be found on the table).
 */
export function makeContext(entries: readonly LogEntry[], prev: ClientGameState, next: ClientGameState, memory: Memory): DeriveCtx {
  const me = next.viewerId;
  const mem: Memory = { played: { ...memory.played }, seen: { ...memory.seen }, grabbed: [...memory.grabbed] };
  const steps: Step[] = [];
  const known = new Set(next.players.map((p) => p.id));

  const who = (id: string) => (id === me ? 'You' : nameFor(next, id));
  /** A seat inside a sentence: "you" for the viewer. */
  const them = (id: string) => (id === me ? 'you' : nameFor(next, id));
  const possessive = (id: string) => (id === me ? 'your' : `${nameFor(next, id)}'s`);
  const ownTone = (id: string): FeedItem['tone'] => (id === me ? 'you' : 'rival');
  /** good = it favours the viewer, bad = it is against them, otherwise a rival's business. */
  const sideTone = (actor: string, victim?: string): FeedItem['tone'] => (actor === me ? 'good' : victim === me ? 'bad' : 'rival');

  // What the viewer's hand lost and gained over the batch.
  const prevHand = new Map(prev.hand.map((c) => [c.id, c]));
  const nextHandIds = new Set(next.hand.map((c) => c.id));
  const goneHand = prev.hand.filter((c) => !nextHandIds.has(c.id));
  const newHand = next.hand.filter((c) => !prevHand.has(c.id));
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
    return { payer, payee, total, cards, timeout: e.data?.timeout === true };
  };
  /** The stamp and the line a payment leaves, whether it has a scene of its own or rode in on a levy. */
  const payNews = ({ payer, payee, total, timeout }: { payer: string; payee: string; total: number; timeout?: boolean }): { fx?: FxSpec; feed: FeedSpec[] } => ({
    fx: payer === me ? { kind: 'pay', text: `Paid ${money(total)}`, amount: total } : payee === me ? { kind: 'collect', text: `+${money(total)}`, amount: total } : undefined,
    feed: [
      // A timeout auto-pay carries its own sentence ("Time ran out: ...") rather than riding the usual `who` + `text`
      // pairing, so the clock reads as the actor instead of "You"/a rival's name leading the line.
      timeout
        ? { tone: payer === me ? 'bad' : payee === me ? 'good' : 'rival', who: '', text: `Time ran out: ${them(payer)} paid ${them(payee)} ${money(total)}` }
        : payer === me
          ? { tone: 'bad', who: 'You', text: `paid ${them(payee)} ${money(total)}` }
          : payee === me
            ? { tone: 'good', who: who(payer), text: `paid you ${money(total)}` }
            : { tone: 'rival', who: who(payer), text: `paid ${them(payee)} ${money(total)}` },
    ],
  });

  return {
    entries,
    prev,
    next,
    me,
    mem,
    steps,
    known,
    who,
    them,
    possessive,
    ownTone,
    sideTone,
    prevHand,
    goneHand,
    claimed,
    oldBuildings,
    done,
    completed,
    add,
    claim,
    playedCard,
    recall,
    faceFor,
    dealFor,
    payDetail,
    payNews,
  };
}
