import { useCallback, useState } from 'react';
import type { Card } from '@monopoly-deal/shared';
import { CARD_MIME, isDiscardExcessMode, legalPlayZones } from '../legality';
import { useGameStore, selectLocalPlayer } from '../store';

export function useDragCard() {
  const state = useGameStore((s) => s.state);
  const localPlayer = useGameStore(selectLocalPlayer);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [legalZones, setLegalZones] = useState<Set<string>>(new Set());

  const onDragStart = useCallback(
    (card: Card, e: React.DragEvent) => {
      const zones = isDiscardExcessMode(state, localPlayer.id)
        ? (localPlayer.hand.some((c) => c.id === card.id) ? ['discard' as const] : [])
        : legalPlayZones(state, localPlayer.id, card.id);
      if (zones.length === 0) {
        e.preventDefault();
        return;
      }
      setDraggingCardId(card.id);
      setLegalZones(new Set(zones));
      e.dataTransfer.setData(CARD_MIME, card.id);
      e.dataTransfer.effectAllowed = 'move';
      const el = e.currentTarget as HTMLElement;
      if (el) e.dataTransfer.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2);
    },
    [state, localPlayer.id],
  );

  const onDragEnd = useCallback(() => {
    setDraggingCardId(null);
    setLegalZones(new Set());
  }, []);

  return { draggingCardId, legalZones, onDragStart, onDragEnd };
}
