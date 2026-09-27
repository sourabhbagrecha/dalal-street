import type { GameEvent } from '@monopoly-deal/shared';
import type { LogEntry } from './types';

function appendLog(
  log: LogEntry[],
  events: GameEvent[],
  seq: number,
): { log: LogEntry[]; seq: number } {
  const next = [...log];
  let s = seq;
  for (const e of events) {
    if (e.type === 'rejected') continue;
    s += 1;
    next.push({
      ...e,
      id: s,
      at: new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
    });
  }
  return { log: next.slice(-200), seq: s };
}

export function appendSingleLog(log: LogEntry[], event: GameEvent, seq: number): { log: LogEntry[]; seq: number } {
  return appendLog(log, [event], seq);
}

/**
 * A reconnect's resent history (see the server's `feedHistory` SSE event) — appended the same way as
 * live events, but only ever onto an empty log: a page reload starts with none, so this is exactly the
 * case it is for; a live stream that merely blipped and reconnected without unmounting already has its
 * own continuous log, and replaying history onto it would double every line.
 */
export function appendHistoryLog(
  log: LogEntry[],
  events: GameEvent[],
  seq: number,
): { log: LogEntry[]; seq: number } {
  if (log.length > 0) return { log, seq };
  return appendLog(log, events, seq);
}
