import { useEffect, useRef, useState } from 'react';

/**
 * Holds a win's announcement — the top-bar text, the win/lose sound, and (a further beat later, see
 * `Victory` in kit.tsx) the victory card itself — until the winning play's own animation has had the
 * table to itself. Without this, the top bar and the sound both fired the instant the server's
 * `winnerId` landed in the projection, while the stage was still pacing out the winning card's own lay
 * and its "SET COMPLETE!" label (`beats.ts`) — the win spoiled itself before the viewer had seen it happen.
 *
 * `animating` is `TableGame.skippable`: true while a beat is still holding the stage. The reveal fires
 * once the stage has been idle for `MIN_HOLD_MS`, but never waits past `MAX_HOLD_MS` — a beat can be
 * dropped under a backlog (see `trim` in beats.ts), and a dropped beat must not hide the winner forever.
 */
const MIN_HOLD_MS = 1200;
const MAX_HOLD_MS = 4000;

/** Pure decision, easy to test without React: has the hold been satisfied? */
export function shouldRevealWin(elapsedMs: number, animating: boolean): boolean {
  return (!animating && elapsedMs >= MIN_HOLD_MS) || elapsedMs >= MAX_HOLD_MS;
}

/**
 * A win already on screen when this mounts (a reload into a finished game) reveals at once — there is
 * nothing left on stage to hold for. `winnerId` returning to null (a rematch dealing a fresh game) resets
 * the hold so the next win goes through the same sequence.
 */
export function useWinReveal(winnerId: string | null, animating: boolean): string | null {
  const [revealed, setRevealed] = useState<string | null>(winnerId);
  const animatingRef = useRef(animating);
  animatingRef.current = animating;
  /** Winner ids already accounted for — the initial mount value needs no timer at all. */
  const resolvedRef = useRef<string | null>(winnerId);

  useEffect(() => {
    if (winnerId === null) {
      resolvedRef.current = null;
      setRevealed(null);
      return;
    }
    if (resolvedRef.current === winnerId) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      if (shouldRevealWin(Date.now() - started, animatingRef.current)) {
        resolvedRef.current = winnerId;
        setRevealed(winnerId);
        window.clearInterval(id);
      }
    }, 100);
    return () => window.clearInterval(id);
    // Only `winnerId` restarts the hold — `animating` is read fresh from the ref on every tick so a beat
    // finishing partway through does not reset the clock.
  }, [winnerId]);

  return revealed;
}
