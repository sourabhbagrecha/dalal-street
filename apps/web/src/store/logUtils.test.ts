import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@monopoly-deal/shared';
import { appendHistoryLog, appendSingleLog } from './logUtils';

const ev = (message: string): GameEvent => ({ type: 'cards_drawn', message });

describe('appendHistoryLog', () => {
  it('replays server-sent history onto an empty log (a reload — the case it exists for)', () => {
    const { log, seq } = appendHistoryLog([], [ev('a'), ev('b')], 0);
    expect(log.map((e) => e.message)).toEqual(['a', 'b']);
    expect(seq).toBe(2);
  });

  it('is a no-op once the log already has anything — a live stream that merely blipped, not a reload', () => {
    const { log: seeded, seq: seededSeq } = appendSingleLog([], ev('live'), 0);
    const { log, seq } = appendHistoryLog(seeded, [ev('a'), ev('b')], seededSeq);
    expect(log.map((e) => e.message)).toEqual(['live']);
    expect(seq).toBe(seededSeq);
  });
});
