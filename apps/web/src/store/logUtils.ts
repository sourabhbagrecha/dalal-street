import type { GameEvent } from '@monopoly-deal/shared';
import type { LogEntry } from './types';

/**
 * `seq` (the second element of this function's return value) is a per-adapter
 * running counter that some callers reset to 0 — on first bootstrap, and on
 * `startNewGame` / `loadFixture` (see `store/localAdapter.ts`). Using it
 * directly as `LogEntry.id` let ids collide across an adapter re-creation
 * (React 19 StrictMode's double render, or a transitional overlap while the
 * store swaps out from under an already-mounted `TableFeed`), which surfaced
 * as a "two children with the same key" React warning. `entryId` instead
 * counts up for the lifetime of the page/module, independent of any single
 * adapter's `seq`, so ids stay unique even across resets.
 */
let entryId = 0;

export function appendLog(
  log: LogEntry[],
  events: GameEvent[],
  seq: number,
): { log: LogEntry[]; seq: number } {
  const next = [...log];
  let s = seq;
  for (const e of events) {
    if (e.type === 'rejected') continue;
    s += 1;
    entryId += 1;
    next.push({
      ...e,
      id: entryId,
      // Clock time, not an elapsed counter — bare MM:SS read as either.
      at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  }
  return { log: next.slice(-200), seq: s };
}

export function appendSingleLog(log: LogEntry[], event: GameEvent, seq: number): { log: LogEntry[]; seq: number } {
  return appendLog(log, [event], seq);
}
