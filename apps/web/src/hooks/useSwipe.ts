import type { PointerEvent as ReactPointerEvent } from 'react';
import { useRef } from 'react';

export interface SwipeHandlers {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
}

const CAPTURE_AFTER_PX = 8;
const SWIPE_MIN_PX = 40;

/**
 * Horizontal swipe recogniser for a pointer-event target. Calls `onSwipe(-1)`
 * when the finger travels left (→ "next") and `onSwipe(1)` when it travels
 * right (→ "previous"); `onDrag` reports the live horizontal offset while the
 * finger is down and `0` once it lifts.
 *
 * Pointer capture is taken only after the finger has actually moved
 * CAPTURE_AFTER_PX, so a plain tap on a child (a seat, an arrow button) still
 * reaches that child as a click — capturing on pointerdown would retarget the
 * click to the swipe surface and swallow it. Give the surface
 * `touch-action: pan-y` so vertical scrolling inside it still belongs to the
 * browser; a native pan cancels the pointer and no swipe fires.
 */
export function useSwipe(onSwipe: (dir: -1 | 1) => void, onDrag?: (dx: number) => void): SwipeHandlers {
  const start = useRef<{ x: number; id: number; captured: boolean } | null>(null);

  const onPointerDown = (e: ReactPointerEvent) => {
    start.current = { x: e.clientX, id: e.pointerId, captured: false };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    if (!s.captured && Math.abs(dx) > CAPTURE_AFTER_PX) {
      s.captured = true;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // A pointer that is no longer active (or a synthetic one) can't be captured; the swipe still resolves on release.
      }
    }
    if (s.captured) onDrag?.(dx);
  };

  const finish = (e: ReactPointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    start.current = null;
    onDrag?.(0);
    if (s.captured && Math.abs(dx) > SWIPE_MIN_PX) onSwipe(dx < 0 ? -1 : 1);
  };

  return { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish };
}
