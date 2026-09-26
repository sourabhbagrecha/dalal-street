import { useCallback, useEffect, useRef, useState } from 'react';
import type { TableGame } from '../model';
import type { Cam } from './layout';

/** Where the game points the camera by itself. `ownPick`: the pick under way aims at one of your own sets. */
export function autoCam(g: TableGame, ownPick: boolean, waitingOn: Set<string>): Cam {
  const p = g.prompt;
  const targeting = p?.kind === 'target' ? p : null;
  /** With a single rival there is nobody to choose between: the camera goes straight to them. */
  const soleRival = g.rivals.length === 1 ? g.rivals[0]!.id : null;
  /** Where the camera goes while the viewer waits on rivals: the one who owes, or the table when several do. */
  const waitCam: Cam = waitingOn.size === 1 ? [...waitingOn][0]! : 'table';
  return p?.kind === 'pay' || p?.kind === 'jsn' || ownPick
    ? 'me'
    : targeting
      ? (soleRival ?? 'table')
      : g.wait
        ? waitCam
        : g.phase === 'rivals'
        ? g.turn
        : g.phase === 'draw'
          ? 'centre'
          : 'me';
}

/** Who has the camera: a scene on the stage for a moment, else wherever you pointed it, else `auto`. */
export function useCamera(g: TableGame, auto: Cam) {
  const p = g.prompt;
  const targeting = p?.kind === 'target' ? p : null;
  const [manual, setManual] = useState<Cam | null>(null);
  // A scene on the stage may take the camera for a moment, then hands it back to the game.
  const [stageCam, setStageCam] = useState<Cam | null>(null);
  const stageCamTimer = useRef(0);
  const holdCam = useCallback((to: Cam, ms: number) => {
    window.clearTimeout(stageCamTimer.current);
    setStageCam(to);
    stageCamTimer.current = window.setTimeout(() => setStageCam(null), ms);
  }, []);
  useEffect(() => () => window.clearTimeout(stageCamTimer.current), []);
  // The camera follows the game unless you pointed it somewhere; every beat of the game re-arms it.
  useEffect(() => setManual(null), [g.phase, g.turn, p?.kind, targeting?.action, targeting?.step]);
  const cam: Cam = stageCam ?? manual ?? auto;
  return { cam, setManual, holdCam };
}
