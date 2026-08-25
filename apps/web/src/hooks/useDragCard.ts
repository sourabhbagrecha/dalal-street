import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card, PlayZone } from '@monopoly-deal/shared';
import { CARD_MIME, dispatchCardDrop, isDiscardExcessMode, makeCardTransfer } from '../legality';
import { useGameStore, useStoreSnapshot } from '../store';

/** Which gesture currently owns `legalZones` — a drag clears a tap and vice versa. */
type ActiveSource = 'drag' | 'tap';

export function useDragCard() {
  const snapshot = useStoreSnapshot();
  const clientState = snapshot.clientState;
  const rejectLocal = useGameStore((api) => api.rejectLocal);
  const getLegalPlayZones = useGameStore((api) => api.getLegalPlayZones);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [legalZones, setLegalZones] = useState<Set<string>>(new Set());
  const activeSource = useRef<ActiveSource | null>(null);

  /** Legal zones for a card, or null (with the same rejectLocal messages the old inline drag check used) if it can't be played at all right now. Shared by both the drag and tap-to-play paths. */
  const zonesFor = useCallback(
    (card: Card): PlayZone[] | null => {
      if (!clientState) return null;
      const viewerId = clientState.viewerId;
      const zones = isDiscardExcessMode(clientState, viewerId)
        ? clientState.you.hand.some((c) => c.id === card.id)
          ? (['discard'] as PlayZone[])
          : []
        : getLegalPlayZones(card.id);
      if (zones.length === 0) {
        rejectLocal(
          clientState.currentPlayerId !== viewerId
            ? 'Wait for your turn to play'
            : clientState.turnPhase === 'awaiting_draw'
              ? 'Draw 2 cards before playing'
              : 'That card cannot be played right now',
        );
        return null;
      }
      return zones;
    },
    [clientState, getLegalPlayZones, rejectLocal],
  );

  const onDragStart = useCallback(
    (card: Card, e: React.DragEvent) => {
      if (!clientState) {
        e.preventDefault();
        return;
      }
      const zones = zonesFor(card);
      if (!zones) {
        e.preventDefault();
        return;
      }

      e.dataTransfer.setData(CARD_MIME, card.id);
      e.dataTransfer.setData('text/plain', card.id);
      e.dataTransfer.effectAllowed = 'move';

      const el = e.currentTarget as HTMLElement;
      if (el) {
        e.dataTransfer.setDragImage(el, el.offsetWidth / 2, Math.round(el.offsetHeight * 0.85));
      }

      // A drag is an unambiguous statement of intent — it takes over from any held tap.
      activeSource.current = 'drag';
      setSelectedCardId(null);
      requestAnimationFrame(() => {
        setDraggingCardId(card.id);
        setLegalZones(new Set(zones));
      });
    },
    [clientState, zonesFor],
  );

  const onDragEnd = useCallback(() => {
    if (activeSource.current !== 'drag') return;
    activeSource.current = null;
    setDraggingCardId(null);
    setLegalZones(new Set());
  }, []);

  const clearSelection = useCallback(() => {
    activeSource.current = null;
    setSelectedCardId(null);
    setLegalZones(new Set());
  }, []);

  /** Tap-to-play: tapping a card holds it and lights its legal zones; tapping it again releases it. */
  const toggleSelect = useCallback(
    (card: Card) => {
      if (selectedCardId === card.id) {
        clearSelection();
        return;
      }
      const zones = zonesFor(card);
      if (!zones) return;
      activeSource.current = 'tap';
      setSelectedCardId(card.id);
      setLegalZones(new Set(zones));
    },
    [selectedCardId, zonesFor, clearSelection],
  );

  // Mounted only while a card is held by tap, so it costs nothing the rest of the time.
  // Fires the same synthetic `drop` the touch-drag polyfill dispatches, on the tapped
  // element itself — bubbling lets PropertySetView's handler see it first, exactly like
  // a native drop, so tapping a specific set still drives the wildcard flip-to-set path.
  //
  // Listens on the capture phase so a zone tap can be intercepted before it reaches the
  // zone's own click handler — the phone bank pill, for instance, otherwise both banks
  // the held card *and* opens its sheet from the same tap, since its onClick would
  // reach the DOM before a bubble-phase listener here ever ran.
  useEffect(() => {
    const cardId = selectedCardId;
    if (!cardId) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      // A tap on any hand card — the held one or a different one — is handled entirely
      // by that card's own onClick (HandFan wires it to toggleSelect, which releases or
      // moves the hold). This listener only has to react to zone taps and empty-board
      // taps; letting it also fire clearSelection for a same-click card switch would
      // race the two state updates and undo the switch.
      if (target.closest('[data-testid^="hand-card-"]')) return;

      // A drop zone can advertise more than one zone (the properties panel now
      // serves both 'property' and 'bank' — see PropertiesPanel), so match against
      // any token it carries rather than the whole attribute string.
      const zoneAttr = target.closest('[data-drop-zone]')?.getAttribute('data-drop-zone');
      const zone = zoneAttr?.split(' ').find((z) => legalZones.has(z));
      if (zone) {
        e.preventDefault();
        e.stopPropagation();
        dispatchCardDrop(target, makeCardTransfer(cardId));
        clearSelection();
        return;
      }
      clearSelection();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [selectedCardId, legalZones, clearSelection]);

  return {
    draggingCardId,
    selectedCardId,
    legalZones,
    onDragStart,
    onDragEnd,
    toggleSelect,
    clearSelection,
  };
}
