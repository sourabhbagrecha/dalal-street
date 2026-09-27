import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Card } from '@monopoly-deal/shared';
import { PlayingCard } from '../components/card/PlayingCard';
import { HOLD_MS } from './tableGlance';

/**
 * One pointer gesture for every layout study: press a card to select it, drag
 * it to play it, or hold it still to read it (the same HOLD_MS the board's own
 * loupe hold uses — see tableGlance.tsx). A drop target is any element carrying
 * `data-zone` ("bank" | "build" | "play" | …) and, optionally, `data-color`
 * (which set a build target belongs to) — the hook only reports what is under
 * the finger, the layout decides what that means. Works with mouse and touch
 * alike; a layout that scrolls its hand sideways gives the cards
 * `data-dragcard="x"` so a horizontal swipe still scrolls and only a vertical
 * pull lifts a card.
 *
 * Once a card is pressed, the gesture is followed on `window`, not on the card:
 * the card can unmount, lose pointer capture or never hear the release (a
 * right-click menu, another window taking focus), and the ghost must still let go.
 *
 * Holding still to read a card works even when `enabled` is false (it is not
 * your turn, or nothing is legal right now): only the tap/drag *outcomes* are
 * gated on that, never the ability to look at your own hand.
 */
interface Hit {
  zone: string | null;
  color?: string;
  el?: HTMLElement;
  /** Where the finger was, for a drop (viewport px). */
  x?: number;
  y?: number;
}

interface DragState extends Hit {
  cardId: string;
  x: number;
  y: number;
}

interface Options {
  onDrop(cardId: string, hit: Hit): void;
  onTap(cardId: string): void;
  onLift?(cardId: string): void;
  /** The finger has held still on the card for HOLD_MS: open it big to read. `y` is where to float the loupe from. */
  onHold?(cardId: string, y: number): void;
  /** The hold above just let go (no tap, no drop) — close whatever `onHold` opened. */
  onHoldEnd?(cardId: string): void;
  enabled?: boolean;
}

interface Press {
  id: string;
  x: number;
  y: number;
  pid: number;
  moved: boolean;
  /** Held still past HOLD_MS: reading, not dragging or tapping. */
  held: boolean;
  /** Whether tap/drag are allowed to act — captured at press-time so a hold that outlives an `enabled` flip stays consistent. */
  enabled: boolean;
  timer: number;
}

const THRESHOLD = 8;

function hitAt(x: number, y: number): Hit {
  for (const el of document.elementsFromPoint(x, y)) {
    const zone = (el as HTMLElement).closest<HTMLElement>('[data-zone]');
    if (zone) return { zone: zone.dataset.zone ?? null, color: zone.dataset.color, el: zone };
  }
  return { zone: null };
}

export function useCardDrag({ onDrop, onTap, onLift, onHold, onHoldEnd, enabled = true }: Options) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const press = useRef<Press | null>(null);
  /** Takes the window listeners of the press in progress off again. */
  const detach = useRef<(() => void) | null>(null);
  const cb = useRef({ onDrop, onTap, onLift, onHold, onHoldEnd });
  cb.current = { onDrop, onTap, onLift, onHold, onHoldEnd };

  /** The press is over: stop listening. */
  const release = useCallback(() => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
    detach.current?.();
    detach.current = null;
  }, []);

  /** Ends the gesture with no drop and no tap: the card stays where it was. Whatever a live hold opened closes too. */
  const abort = useCallback(() => {
    if (press.current?.held) cb.current.onHoldEnd?.(press.current.id);
    release();
    setDrag(null);
  }, [release]);

  useEffect(() => () => release(), [release]);

  const start = useCallback(
    (p: Press) => {
      press.current = p;
      const mine = (e: PointerEvent) => (press.current?.pid === e.pointerId ? press.current : null);
      // Held still this long without moving: stop waiting for a drag and open it big to read instead.
      p.timer = window.setTimeout(() => {
        if (press.current !== p || p.moved) return;
        p.held = true;
        cb.current.onHold?.(p.id, p.y);
      }, HOLD_MS);
      const move = (e: PointerEvent) => {
        const cur = mine(e);
        if (!cur) return;
        if (cur.held) return; // reading, not dragging — the hold answers for the gesture now
        // A mouse button that is no longer down means the release went somewhere this page never saw it.
        if (e.pointerType === 'mouse' && e.buttons === 0) return abort();
        if (!cur.moved && Math.hypot(e.clientX - cur.x, e.clientY - cur.y) > THRESHOLD) {
          cur.moved = true;
          window.clearTimeout(cur.timer);
          if (cur.enabled) cb.current.onLift?.(cur.id);
        }
        if (cur.moved && cur.enabled) setDrag({ cardId: cur.id, x: e.clientX, y: e.clientY, ...hitAt(e.clientX, e.clientY) });
      };
      const up = (e: PointerEvent) => {
        const cur = mine(e);
        if (!cur) return;
        window.clearTimeout(cur.timer);
        release();
        try {
          if (cur.held) cb.current.onHoldEnd?.(cur.id);
          else if (cur.moved) {
            if (cur.enabled) cb.current.onDrop(cur.id, { ...hitAt(e.clientX, e.clientY), x: e.clientX, y: e.clientY });
          } else if (cur.enabled) cb.current.onTap(cur.id);
        } finally {
          // Whatever the drop did (or threw), the ghost goes.
          setDrag(null);
        }
      };
      const cancel = (e: PointerEvent) => {
        if (mine(e)) abort();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      // A right-click menu or another window taking focus can swallow the release.
      window.addEventListener('contextmenu', abort);
      window.addEventListener('blur', abort);
      detach.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('contextmenu', abort);
        window.removeEventListener('blur', abort);
      };
    },
    [abort, release],
  );

  const bind = useCallback(
    (cardId: string) => ({
      'data-dragcard': '',
      role: 'button' as const,
      tabIndex: 0,
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          cb.current.onTap(cardId);
        }
      },
      onPointerDown: (e: ReactPointerEvent) => {
        // One gesture at a time: a second finger or button does not take over the first's. Unlike tap and drag,
        // holding still to read the card is never gated on `enabled` — see the note above the hook.
        if (press.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
        try {
          // Keeps the events coming if the pointer slides off the card; the window listeners do not depend on it.
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone */
        }
        start({ id: cardId, x: e.clientX, y: e.clientY, pid: e.pointerId, moved: false, held: false, enabled, timer: 0 });
      },
    }),
    [enabled, start],
  );

  return { drag, bind };
}

/** The card under the finger while dragging. Pointer-transparent. */
export function DragGhost({ drag, card, w = 96 }: { drag: DragState | null; card: Card | undefined; w?: number }) {
  if (!drag || !card) return null;
  return (
    <div
      className="gl-ghost"
      style={{ left: drag.x, top: drag.y, ['--card-w' as string]: `${w}px` }}
      data-over={drag.zone ?? ''}
    >
      <PlayingCard card={card} />
    </div>
  );
}
