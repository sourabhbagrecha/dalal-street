/**
 * Paces a burst of sound picks so they release together with the next real "beat" (or a fallback timer, if
 * none ever arrives) rather than the instant they are decided, and staggers them within that release so a
 * burst never lands in one instant. Framework-free (no React, no `soundEngine`) so its timing can be
 * asserted directly with vitest's fake timers; `useSoundEffects` is the only caller.
 */
export interface SoundQueue<K> {
  /** Queues a pick for the next release. */
  push(key: K): void;
  /** Call whenever a new beat lands: releases everything queued, staggered. A no-op with nothing queued. */
  release(): void;
  /** Clears any pending timers (unmount). */
  dispose(): void;
}

export interface SoundQueueOptions {
  /** Gap between two picks released together, so they don't layer into noise. */
  staggerMs?: number;
  /** A pick is released even with no beat to key off (its beat was dropped), so nothing is stranded. */
  fallbackMs?: number;
}

export function createSoundQueue<K>(play: (key: K) => void, opts: SoundQueueOptions = {}): SoundQueue<K> {
  const staggerMs = opts.staggerMs ?? 90;
  const fallbackMs = opts.fallbackMs ?? 500;
  let pending: K[] = [];
  let fallback: ReturnType<typeof setTimeout> | null = null;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const release = () => {
    if (fallback !== null) {
      clearTimeout(fallback);
      fallback = null;
    }
    const keys = pending;
    pending = [];
    keys.forEach((key, i) => {
      if (i === 0) {
        play(key);
        return;
      }
      timers.push(setTimeout(() => play(key), i * staggerMs));
    });
  };

  return {
    push(key) {
      pending.push(key);
      if (fallback === null) fallback = setTimeout(release, fallbackMs);
    },
    release,
    dispose() {
      for (const t of timers) clearTimeout(t);
      timers.length = 0;
      if (fallback !== null) {
        clearTimeout(fallback);
        fallback = null;
      }
    },
  };
}
