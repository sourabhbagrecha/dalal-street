import { useEffect, useRef, useState } from 'react';
import type { ClientGameState } from '@monopoly-deal/shared';
import { nameFor } from '../../derivations';
import type { ToastPort } from './context';

/** How long the cue stays up before it fades on its own. */
const CUE_MS = 4000;

/**
 * "You're next": a brief, non-blocking cue for the viewer when the seat immediately before them in turn
 * order — `clientState.players`' stable seat order, the same array `currentPlayerIndex` rotates through
 * server-side — becomes the active player. Gives advance notice the viewer's own turn is coming instead of
 * only finding out once it already has. Wraps around the table (last seat's "next" is seat 0).
 *
 * Auto-clears after a few seconds, and immediately once the viewer's own turn actually starts (the HUD line
 * takes over from there).
 */
export function useYoureNextCue(clientState: ClientGameState | null): ToastPort {
  const [text, setText] = useState<string | null>(null);
  const lastCurrent = useRef<string | null>(null);

  useEffect(() => {
    if (!clientState) return;
    const { players, viewerId, currentPlayerId } = clientState;
    const prev = lastCurrent.current;
    lastCurrent.current = currentPlayerId;

    if (currentPlayerId === viewerId) {
      setText(null); // it's the viewer's turn now — the cue already did its job
      return;
    }
    if (prev === null || prev === currentPlayerId) return; // first projection seen, or no turn change

    const n = players.length;
    const idx = players.findIndex((p) => p.id === viewerId);
    if (idx < 0 || n < 2) return;
    const before = players[(idx - 1 + n) % n];
    if (before && before.id === currentPlayerId) {
      setText(`${nameFor(clientState, before.id)}'s turn — you're up next`);
    }
  }, [clientState]);

  useEffect(() => {
    if (!text) return;
    const t = window.setTimeout(() => setText(null), CUE_MS);
    return () => window.clearTimeout(t);
  }, [text]);

  return { text, clear: () => setText(null) };
}
