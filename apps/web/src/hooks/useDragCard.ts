import { useCallback, useState } from 'react';
import type { Card } from '@monopoly-deal/shared';
import { CARD_MIME, isDiscardExcessMode, legalPlayZones } from '../legality';
import { useGameStore, selectLocalPlayer } from '../store';

export function useDragCard() {
  const state = useGameStore((s) => s.state);
  const localPlayer = useGameStore(selectLocalPlayer);
  const rejectLocal = useGameStore((s) => s.rejectLocal);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [legalZones, setLegalZones] = useState<Set<string>>(new Set());

  const onDragStart = useCallback(
    (card: Card, e: React.DragEvent) => {
      const zones = isDiscardExcessMode(state, localPlayer.id)
        ? (localPlayer.hand.some((c) => c.id === card.id) ? ['discard' as const] : [])
        : legalPlayZones(state, localPlayer.id, card.id);
      if (zones.length === 0) {
        e.preventDefault();
        rejectLocal(
          state.turnPhase === 'awaiting_draw'
            ? 'Draw 2 cards before playing'
            : 'That card cannot be played right now',
        );
        return;
      }

      // Must set data synchronously in dragstart for the drag session to stick.
      e.dataTransfer.setData(CARD_MIME, card.id);
      e.dataTransfer.setData('text/plain', card.id);
      e.dataTransfer.effectAllowed = 'move';

      const el = e.currentTarget as HTMLElement;
      if (el) {
        e.dataTransfer.setDragImage(el, el.offsetWidth / 2, Math.round(el.offsetHeight * 0.85));
      }

      // Defer React state so re-render does not cancel the nascent HTML5 drag.
      requestAnimationFrame(() => {
        setDraggingCardId(card.id);
        setLegalZones(new Set(zones));
      });
    },
    [state, localPlayer.id, rejectLocal],
  );

  const onDragEnd = useCallback(() => {
    setDraggingCardId(null);
    setLegalZones(new Set());
  }, []);

  return { draggingCardId, legalZones, onDragStart, onDragEnd };
}
