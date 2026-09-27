import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createSoundQueue } from './soundQueue';

describe('createSoundQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not play a queued pick until release is called (sound no longer leads picture)', () => {
    const played: string[] = [];
    const q = createSoundQueue<string>((k) => played.push(k));
    q.push('attack');
    vi.advanceTimersByTime(200);
    expect(played).toEqual([]); // still waiting on a beat, not fired on arrival
    q.release();
    expect(played).toEqual(['attack']);
  });

  it('releases every queued pick the instant release is called, when there is only one', () => {
    const played: string[] = [];
    const q = createSoundQueue<string>((k) => played.push(k));
    q.push('place');
    q.release();
    expect(played).toEqual(['place']);
  });

  it('staggers a burst queued in one batch instead of playing them all in the same instant', () => {
    const played: { key: string; at: number }[] = [];
    const q = createSoundQueue<string>((k) => played.push({ key: k, at: Date.now() }), { staggerMs: 90 });
    q.push('discard');
    q.push('attack');
    q.push('attack');
    q.release();
    expect(played.map((p) => p.key)).toEqual(['discard']); // only the first fires synchronously
    vi.advanceTimersByTime(90);
    expect(played.map((p) => p.key)).toEqual(['discard', 'attack']);
    vi.advanceTimersByTime(90);
    expect(played.map((p) => p.key)).toEqual(['discard', 'attack', 'attack']);
    expect(played[1]!.at - played[0]!.at).toBe(90);
    expect(played[2]!.at - played[1]!.at).toBe(90);
  });

  it('falls back to releasing on its own if nothing ever calls release (a beat that never lands)', () => {
    const played: string[] = [];
    const q = createSoundQueue<string>((k) => played.push(k), { fallbackMs: 500 });
    q.push('break');
    vi.advanceTimersByTime(499);
    expect(played).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(played).toEqual(['break']);
  });

  it('release is a no-op with nothing queued', () => {
    const played: string[] = [];
    const q = createSoundQueue<string>((k) => played.push(k));
    expect(() => q.release()).not.toThrow();
    expect(played).toEqual([]);
  });

  it('a second push before release joins the same batch and is staggered after the first', () => {
    const played: string[] = [];
    const q = createSoundQueue<string>((k) => played.push(k), { staggerMs: 100 });
    q.push('pay');
    vi.advanceTimersByTime(50);
    q.push('pay');
    q.release();
    expect(played).toEqual(['pay']);
    vi.advanceTimersByTime(100);
    expect(played).toEqual(['pay', 'pay']);
  });

  it('dispose cancels the fallback timer and any staggered releases still pending', () => {
    const played: string[] = [];
    const q = createSoundQueue<string>((k) => played.push(k), { staggerMs: 90, fallbackMs: 500 });
    q.push('attack');
    q.push('attack');
    q.release(); // first plays now, second is staggered 90ms out
    q.dispose();
    vi.advanceTimersByTime(1000);
    expect(played).toEqual(['attack']); // the staggered second never fired after dispose
  });
});
