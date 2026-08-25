import type { GameEvent } from '@monopoly-deal/shared';
import type { LogEntry } from './types';

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
