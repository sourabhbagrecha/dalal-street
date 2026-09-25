import { useCallback, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { Card } from '@monopoly-deal/shared';
import { PlayingCard } from '../../components/PlayingCard';

/**
 * One pointer gesture for every layout study: press a card to select it, drag
 * it to play it. A drop target is any element carrying `data-zone`
 * ("bank" | "build" | "play" | …) and, optionally, `data-color` (which set a
 * build target belongs to) — the hook only reports what is under the finger,
 * the layout decides what that means. Works with mouse and touch alike; a
 * layout that scrolls its hand sideways gives the cards `data-dragcard="x"`
 * so a horizontal swipe still scrolls and only a vertical pull lifts a card.
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
  const press = useRef<{ id: string; x: number; y: number; pid: number; moved: boolean } | null>(null);
  const cb = useRef({ onDrop, onTap, onLift });
  cb.current = { onDrop, onTap, onLift };

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
      onPointerDown: (e: PointerEvent) => {
        if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
        press.current = { id: cardId, x: e.clientX, y: e.clientY, pid: e.pointerId, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: (e: PointerEvent) => {
        const p = press.current;
        if (!p || p.pid !== e.pointerId) return;
        if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) > THRESHOLD) {
          p.moved = true;
          cb.current.onLift?.(p.id);
        }
        if (p.moved) setDrag({ cardId: p.id, x: e.clientX, y: e.clientY, ...hitAt(e.clientX, e.clientY) });
      },
      onPointerUp: (e: PointerEvent) => {
        const p = press.current;
        if (!p || p.pid !== e.pointerId) return;
        press.current = null;
        if (p.moved) {
          cb.current.onDrop(p.id, { ...hitAt(e.clientX, e.clientY), x: e.clientX, y: e.clientY });
          setDrag(null);
        } else {
          cb.current.onTap(p.id);
        }
      },
      onPointerCancel: () => {
        press.current = null;
        setDrag(null);
      },
    }),
    [enabled],
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
