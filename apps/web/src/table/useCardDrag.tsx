import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Card } from '@monopoly-deal/shared';
import { PlayingCard } from '../components/card/PlayingCard';

/**
 * One pointer gesture for every layout study: press a card to select it, drag
 * it to play it. A drop target is any element carrying `data-zone`
 * ("bank" | "build" | "play" | …) and, optionally, `data-color` (which set a
 * build target belongs to) — the hook only reports what is under the finger,
 * the layout decides what that means. Works with mouse and touch alike; a
 * layout that scrolls its hand sideways gives the cards `data-dragcard="x"`
 * so a horizontal swipe still scrolls and only a vertical pull lifts a card.
 *
 * Once a card is pressed, the gesture is followed on `window`, not on the card:
 * the card can unmount, lose pointer capture or never hear the release (a
 * right-click menu, another window taking focus), and the ghost must still let go.
 */
export interface Hit {
  zone: string | null;
  color?: string;
  el?: HTMLElement;
  /** Where the finger was, for a drop (viewport px). */
  x?: number;
  y?: number;
}

export interface DragState extends Hit {
  cardId: string;
  x: number;
  y: number;
}

interface Options {
  onDrop(cardId: string, hit: Hit): void;
  onTap(cardId: string): void;
  onLift?(cardId: string): void;
  enabled?: boolean;
}

interface Press {
  id: string;
  x: number;
  y: number;
  pid: number;
  moved: boolean;
}

const THRESHOLD = 8;

export function hitAt(x: number, y: number): Hit {
  for (const el of document.elementsFromPoint(x, y)) {
    const zone = (el as HTMLElement).closest<HTMLElement>('[data-zone]');
    if (zone) return { zone: zone.dataset.zone ?? null, color: zone.dataset.color, el: zone };
  }
  return { zone: null };
}

export function useCardDrag({ onDrop, onTap, onLift, enabled = true }: Options) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const press = useRef<Press | null>(null);
  /** Takes the window listeners of the press in progress off again. */
  const detach = useRef<(() => void) | null>(null);
  const cb = useRef({ onDrop, onTap, onLift });
  cb.current = { onDrop, onTap, onLift };

  /** The press is over: stop listening. */
  const release = useCallback(() => {
    press.current = null;
    detach.current?.();
    detach.current = null;
  }, []);

  /** Ends the gesture with no drop and no tap: the card stays where it was. */
  const abort = useCallback(() => {
    release();
    setDrag(null);
  }, [release]);

  useEffect(() => () => release(), [release]);

  const start = useCallback(
    (p: Press) => {
      press.current = p;
      const mine = (e: PointerEvent) => (press.current?.pid === e.pointerId ? press.current : null);
      const move = (e: PointerEvent) => {
        const cur = mine(e);
        if (!cur) return;
        // A mouse button that is no longer down means the release went somewhere this page never saw it.
        if (e.pointerType === 'mouse' && e.buttons === 0) return abort();
        if (!cur.moved && Math.hypot(e.clientX - cur.x, e.clientY - cur.y) > THRESHOLD) {
          cur.moved = true;
          cb.current.onLift?.(cur.id);
        }
        if (cur.moved) setDrag({ cardId: cur.id, x: e.clientX, y: e.clientY, ...hitAt(e.clientX, e.clientY) });
      };
      const up = (e: PointerEvent) => {
        const cur = mine(e);
        if (!cur) return;
        release();
        try {
          if (cur.moved) cb.current.onDrop(cur.id, { ...hitAt(e.clientX, e.clientY), x: e.clientX, y: e.clientY });
          else cb.current.onTap(cur.id);
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
        // One gesture at a time: a second finger or button does not take over the first's.
        if (!enabled || press.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
        try {
          // Keeps the events coming if the pointer slides off the card; the window listeners do not depend on it.
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone */
        }
        start({ id: cardId, x: e.clientX, y: e.clientY, pid: e.pointerId, moved: false });
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
