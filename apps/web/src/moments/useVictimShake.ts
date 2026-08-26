import { useEffect } from 'react';

const SHAKE_MS = 320;

/**
 * Toggles `data-shake` on `.game-board` for the callout's victim variant — a
 * single, self-cleaning attribute write rather than plumbing shake state
 * through props. `MomentCallout` calls this with whether the callout on
 * screen right now is a victim-perspective one.
 */
export function useVictimShake(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const board = document.querySelector<HTMLElement>('.game-board');
    if (!board) return;
    board.setAttribute('data-shake', 'true');
    const t = window.setTimeout(() => board.removeAttribute('data-shake'), SHAKE_MS);
    return () => {
      window.clearTimeout(t);
      board.removeAttribute('data-shake');
    };
  }, [active]);
}
