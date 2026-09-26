import { useEffect, useState } from 'react';
import type { ClientGameState } from '@monopoly-deal/shared';
import type { LogEntry } from '../store/types';
import { flush, ingest, initialLive, release } from './beats';
import type { Beat, FeedItem, Fx } from './model';

/** A batch of events whose projection never arrives is derived against what is on screen after this long. */
const HELD_FLUSH_MS = 2000;

/**
 * What the event log says just happened, in the table's terms: the beat the stage should act out, the
 * one-shot stamp and the feed lines. Call once per render with the store's log and projection.
 *
 * The server sends a command's events and then the projection that holds their result, so fresh entries wait for
 * the next projection and are derived against the diff of the two (`beats.ts`). A command can add up to several
 * beats; they are released one at a time, each in its own commit, so `TableScreen` sees one `beat.id` per scene.
 * The first scene starts in the very render the projection lands in, so the stage can still find where the cards were.
 */
export function useLiveEvents(
  log: LogEntry[],
  state: ClientGameState | null,
): { beat: Beat | null; fx: Fx | null; feed: FeedItem[] } {
  const [live, setLive] = useState(initialLive);

  // Derived state, set during render: React re-renders this component at once with the result (no stale frame).
  if (live.seenLog !== log || live.seenState !== state) setLive(ingest(live, log, state));

  // The scene on stage has had its time: the next one may start (or the stage is let go).
  const { playing, token } = live;
  useEffect(() => {
    if (playing <= 0) return;
    const t = window.setTimeout(() => setLive((cur) => release(cur, token)), playing);
    return () => window.clearTimeout(t);
  }, [playing, token]);

  // Events with no projection behind them are not held for ever.
  const held = live.held;
  useEffect(() => {
    if (held.length === 0) return;
    const t = window.setTimeout(() => setLive((cur) => (cur.held === held ? flush(cur) : cur)), HELD_FLUSH_MS);
    return () => window.clearTimeout(t);
  }, [held]);

  return { beat: live.beat, fx: live.fx, feed: live.feed };
}
