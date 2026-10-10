import { useEffect, useRef, useState } from 'react';
import { soundEngine } from '../../sound/soundEngine';

const wholeSecs = (ms: number): number => Math.max(0, Math.ceil(ms / 1000));

/** How close to 0 a countdown has to be before the UI escalates: a pulse at 10s, a harder one at 5s. Fixed UI cues — never the server's own deadlines. */
type Urgency = 'warn' | 'critical';
export function urgencyOf(secs: number | null): Urgency | undefined {
  if (secs === null) return undefined;
  if (secs <= 5) return 'critical';
  if (secs <= 10) return 'warn';
  return undefined;
}

/**
 * Whole seconds left on a server deadline, counted down locally from the remaining-ms the last projection carried
 * (re-synced whenever the server sends a new value). It only re-renders once a second —
 * this lives in the hook that feeds the whole table, so a 4 Hz tick would repaint everything for nothing.
 * Null when there is no deadline.
 */
export function useSecondsLeft(remainingMs: number | undefined): number | null {
  const [secs, setSecs] = useState<number | null>(remainingMs === undefined ? null : wholeSecs(remainingMs));

  useEffect(() => {
    if (remainingMs === undefined) {
      setSecs(null);
      return;
    }
    const started = Date.now();
    let id = 0;
    // One timeout per displayed second, aimed at the instant the whole-second value changes — no polling in between.
    const tick = () => {
      const left = remainingMs - (Date.now() - started);
      setSecs(wholeSecs(left));
      if (left <= 0) return;
      id = window.setTimeout(tick, Math.max(16, left - (wholeSecs(left) - 1) * 1000 + 2));
    };
    tick();
    return () => window.clearTimeout(id);
  }, [remainingMs]);

  return secs;
}

/**
 * Ticks every whole second from 10 down to 0: a soft synthesized tick (`soundEngine`, muted the same as every
 * other table sound), brighter (`tickUrgent`) once ≤5s, plus a device buzz on platforms that support
 * `navigator.vibrate` — a feature-detected no-op everywhere else (notably Safari/iOS). The CSS pulse on the rival puck
 * and `Countdown` bar (`data-urgency`) reads `urgencyOf` directly and needs no help from here.
 *
 * Call this once for the whole table (the HUD, which is always mounted while a clock runs), not once per surface
 * that also shows the same countdown (the Just Say No alert, the pay tray), or a single clock ticks more than
 * once per second.
 */
export function useTimeoutEscalation(secs: number | null): void {
  const last = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (secs === null || secs > 10) {
      last.current = undefined;
      return;
    }
    if (secs !== last.current) {
      soundEngine.play(secs <= 5 ? 'tickUrgent' : 'tick');
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(secs <= 5 ? [40, 30, 40] : 30);
      }
      last.current = secs;
    }
  }, [secs]);
}
