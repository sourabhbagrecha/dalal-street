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
    const tick = () => setSecs(wholeSecs(remainingMs - (Date.now() - started)));
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [remainingMs]);

  return secs;
}

/**
 * Escalates once on crossing into 'warn' (≤10s) and once more into 'critical' (≤5s): a soft synthesized tick
 * (`soundEngine`, muted the same as every other table sound) plus a device buzz on platforms that support
 * `navigator.vibrate` — a feature-detected no-op everywhere else (notably Safari/iOS). The CSS pulse on the ring and
 * `Countdown` bar (`data-urgency`/`tb-hud__ring--*`) reads `urgencyOf` directly and needs no help from here.
 *
 * Call this once for the whole table (the HUD, which is always mounted while a clock runs), not once per surface
 * that also shows the same countdown (the Just Say No alert, the pay tray), or a single clock escalates more than
 * once per threshold.
 */
export function useTimeoutEscalation(secs: number | null): void {
  const last = useRef<Urgency | undefined>(undefined);
  useEffect(() => {
    const level = urgencyOf(secs);
    if (level !== last.current) {
      // Only entering a band for the first time escalates: undefined → warn, undefined → critical (a late-loading
      // clock that starts past 10s), or warn → critical. Never on the way back up.
      const escalating = !!level && (last.current === undefined || (level === 'critical' && last.current === 'warn'));
      if (escalating) {
        soundEngine.play(level === 'critical' ? 'tickUrgent' : 'tick');
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(level === 'critical' ? [40, 30, 40] : 30);
        }
      }
      last.current = level;
    }
  }, [secs]);
}
