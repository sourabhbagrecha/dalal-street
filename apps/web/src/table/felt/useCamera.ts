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

const WIDE_KEY = 'monopoly-deal:table-wide';

function readWide(): boolean {
  try {
    return window.localStorage.getItem(WIDE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeWide(wide: boolean): void {
  try {
    window.localStorage.setItem(WIDE_KEY, wide ? '1' : '0');
  } catch {
    // ignore
  }
}

/**
 * Who has the camera: a scene on the stage for a moment, else wherever you pointed it, else `auto`.
 * `wide` (the HUD's zoom toggle, remembered per browser) keeps the whole table in view through the rivals' turns:
 * the camera no longer swoops onto the acting rival's seat, and the stage no longer borrows it for a rival's scene.
 * Your own turn, and a card played at you (you pay, or may say no), still bring it in.
 */
export function useCamera(g: TableGame, auto: Cam) {
  const p = g.prompt;
  const targeting = p?.kind === 'target' ? p : null;
  const [manual, setManual] = useState<Cam | null>(null);
  const [wide, setWide] = useState(readWide);
  const toggleWide = () => {
    writeWide(!wide);
    setWide(!wide);
    // Zooming out shows the whole table now; zooming back in hands the camera back to the game.
    setManual(wide ? null : 'table');
  };
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
  const onRival = (c: Cam | null) => !!c && g.rivals.some((r) => r.id === c);
  const held = wide && onRival(stageCam) ? null : stageCam;
  const followed = wide && g.turn !== g.me.id && onRival(auto) ? 'table' : auto;
  const cam: Cam = held ?? manual ?? followed;
  return { cam, setManual, holdCam, wide, toggleWide };
}
