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
 *
 * The derivation (log entries + projection diff → steps) lives in `derive/`; this file keeps the queue that paces them.
 */
import type { ClientGameState } from '@monopoly-deal/shared';
import { collectPendingContested, threatKeyForContested } from '../moments/derive';
import type { LogEntry } from '../store/types';
import { deriveSteps } from './derive/deriveSteps';
import type { Memory, Step } from './derive/step';
import { emptyMemory, sceneMs } from './derive/step';
import type { Beat, FeedItem, Fx } from './model';

export { sceneMs };

// ── pacing ───────────────────────────────────────────────────────────────────

/** No scene is ever cut shorter than this, however deep the backlog. */
const MIN_WAIT = 200;
/** More than this many beats waiting: the oldest lay/toss beats give up their animation. */
export const QUEUE_CAP = 6;
/** A backlog is compressed so it never takes longer than this to clear. */
export const WAIT_CAP = 5000;

// ── the queue ────────────────────────────────────────────────────────────────

/** What `useLiveEvents` keeps between renders. Every transition below is pure, so it can be driven without React. */
interface LiveState {
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

const FEED_CAP = 60;

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
