import { useEffect, useState } from 'react';

const wholeSecs = (ms: number): number => Math.max(0, Math.ceil(ms / 1000));

/**
 * Whole seconds left on a server deadline, counted down locally from the remaining-ms the last projection carried
 * (re-synced whenever the server sends a new value). Like `useCountdown`, but it only re-renders once a second —
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
