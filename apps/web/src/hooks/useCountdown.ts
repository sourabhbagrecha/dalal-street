import { useEffect, useState } from 'react';

/** Count down from remaining-ms snapshot; re-syncs when server sends a new value. */
export function useCountdown(remainingMs: number | undefined): number | null {
  const [remaining, setRemaining] = useState<number | null>(remainingMs ?? null);

  useEffect(() => {
    if (remainingMs === undefined) {
      setRemaining(null);
      return;
    }
    setRemaining(remainingMs);
    const started = Date.now();
    const tick = () => {
      const elapsed = Date.now() - started;
      setRemaining(Math.max(0, remainingMs - elapsed));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [remainingMs]);

  return remaining;
}

export function formatCountdown(ms: number | null): string {
  if (ms === null) return '—';
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}
