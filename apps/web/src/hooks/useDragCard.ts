import { useCallback, useState } from 'react';
import type { Card } from '@monopoly-deal/shared';
import { CARD_MIME, isDiscardExcessMode } from '../legality';
import { useGameStore, useStoreSnapshot } from '../store';

export function useDragCard() {
  const snapshot = useStoreSnapshot();
  const clientState = snapshot.clientState;
  const rejectLocal = useGameStore((api) => api.rejectLocal);
  const getLegalPlayZones = useGameStore((api) => api.getLegalPlayZones);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [legalZones, setLegalZones] = useState<Set<string>>(new Set());

  const onDragStart = useCallback(
    (card: Card, e: React.DragEvent) => {
      if (!clientState) {
        e.preventDefault();
        return;
      }
      const viewerId = clientState.viewerId;
      const zones = isDiscardExcessMode(clientState, viewerId)
        ? clientState.you.hand.some((c) => c.id === card.id)
          ? ['discard' as const]
          : []
        : getLegalPlayZones(card.id);
      if (zones.length === 0) {
        e.preventDefault();
        rejectLocal(
          clientState.turnPhase === 'awaiting_draw'
            ? 'Draw 2 cards before playing'
            : 'That card cannot be played right now',
        );
        return;
      }

      e.dataTransfer.setData(CARD_MIME, card.id);
      e.dataTransfer.setData('text/plain', card.id);
      e.dataTransfer.effectAllowed = 'move';

      const el = e.currentTarget as HTMLElement;
      if (el) {
        e.dataTransfer.setDragImage(el, el.offsetWidth / 2, Math.round(el.offsetHeight * 0.85));
      }

      requestAnimationFrame(() => {
        setDraggingCardId(card.id);
        setLegalZones(new Set(zones));
      });
    },
    [clientState, getLegalPlayZones, rejectLocal],
  );

  const onDragEnd = useCallback(() => {
    setDraggingCardId(null);
    setLegalZones(new Set());
  }, []);

  return { draggingCardId, legalZones, onDragStart, onDragEnd };
}
