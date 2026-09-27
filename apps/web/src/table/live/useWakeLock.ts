import { useEffect } from 'react';

/**
 * Holds the screen on (`navigator.wakeLock`) while `active` — seated at a live table, where a fast bot's turn can
 * pass in a couple of seconds but a slow one (or a human) can leave the phone idle for the full 60s turn window,
 * long enough to auto-lock and drop the tab in the background. Feature-detected: a no-op on browsers without the
 * API (notably Safari on older iOS), and it never throws on a request the platform refuses (battery saver, a
 * backgrounded tab already past the point of asking).
 *
 * The lock itself is released by the browser whenever the tab is hidden, so a visibility change back to visible
 * re-requests it — this is the Wake Lock API's own documented lifecycle, not a workaround.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // Refused (battery saver, an already-hidden document, no permission) — the table still works, just without the lock.
      }
    };

    void acquire();

    const onVisibility = () => {
      // The OS/browser releases the lock the moment the tab goes hidden; coming back visible asks again.
      if (document.visibilityState === 'visible' && !sentinel) void acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release();
      sentinel = null;
    };
  }, [active]);
}
