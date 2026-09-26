/**
 * The unit the beat queue carries (`Step`), what one batch remembers for the next (`Memory`), and how long each
 * beat's scene holds the stage (`sceneMs`).
 */
import type { Card } from '@monopoly-deal/shared';
import type { Beat, FeedItem, Fx } from '../model';

// ── types ────────────────────────────────────────────────────────────────────

type Bare<T> = T extends unknown ? Omit<T, 'id'> : never;
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
const GAP = 450;
const TOSS_GAP = 250;

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
