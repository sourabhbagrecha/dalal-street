import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card, PlayZone } from '@monopoly-deal/shared';
import { CARD_MIME, dispatchCardDrop, isDiscardExcessMode, makeCardTransfer } from '../legality';
import { useGameStore, useStoreSnapshot } from '../store';
import type { WastedPlayReason } from '../store/types';

/** Which gesture currently owns `legalZones` — a drag clears a tap and vice versa. */
type ActiveSource = 'drag' | 'tap';

/**
 * FIX 5 / B6: short, player-facing copy for each `WastedPlayReason` kind —
 * this is presentation only, mirroring `wastedPlayCopy` in GamePrompts.tsx
 * (a file this agent doesn't own) at a shorter length for a toast rather
 * than a confirmation sheet. The eligibility rule itself lives entirely in
 * the engine's `wastedDiscardPlay` (`packages/engine/src/wastedPlay.ts`);
 * this only turns its typed reason into words.
 */
function shortWastedReason(reason: WastedPlayReason): string {
  switch (reason.kind) {
    case 'rent_no_colors':
      return "You own none of this rent card's colours";
    case 'sly_deal_no_targets':
      return 'No property anyone can steal';
    case 'forced_deal_no_own':
      return 'You have no property to trade';
    case 'forced_deal_no_targets':
      return 'No opponent has a tradeable property';
    case 'deal_breaker_no_sets':
      return 'No opponent has a completed set';
    case 'building_no_set':
      return reason.building === 'house' ? 'Needs a completed set' : 'Needs a set with a house';
    case 'double_rent_no_rent':
      return 'No rent card to double';
    case 'double_rent_no_plays':
      return 'No play left to use it';
    case 'nobody_can_pay':
      return 'No opponent can pay';
  }
}

export function useDragCard() {
  const snapshot = useStoreSnapshot();
  const clientState = snapshot.clientState;
  const rejectLocal = useGameStore((api) => api.rejectLocal);
  const getLegalPlayZones = useGameStore((api) => api.getLegalPlayZones);
  const wastedDiscardPlayFn = useGameStore((api) => api.wastedDiscardPlay);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [legalZones, setLegalZones] = useState<Set<string>>(new Set());
  const activeSource = useRef<ActiveSource | null>(null);

  /** Legal zones for a card, or null (with the same rejectLocal messages the old inline drag check used) if it can't be played at all right now. Shared by both the drag and tap-to-play paths. */
  const zonesFor = useCallback(
    (card: Card): PlayZone[] | null => {
      if (!clientState) return null;
      const viewerId = clientState.viewerId;
      const excessMode = isDiscardExcessMode(clientState, viewerId);
      const zones = excessMode
        ? clientState.you.hand.some((c) => c.id === card.id)
          ? (['discard'] as PlayZone[])
          : []
        : getLegalPlayZones(card.id);

      const myTurnToPlay =
        clientState.currentPlayerId === viewerId &&
        clientState.turnPhase !== 'awaiting_draw' &&
        !excessMode;

      if (zones.length === 0) {
        // FIX 5 / B6: a card that's illegal everywhere right now most often
        // is because it would do nothing at all (a Hotel with no completed
        // set, a Rent card for colours the player owns none of) — the
        // engine already knows exactly why via `wastedDiscardPlay`, so ask
        // it before falling back to the generic reasons below.
        const wastedReason = myTurnToPlay ? wastedDiscardPlayFn(card.id) : null;
        rejectLocal(
          clientState.currentPlayerId !== viewerId
            ? 'Wait for your turn to play'
            : clientState.turnPhase === 'awaiting_draw'
              ? 'Draw 2 cards before playing'
              : wastedReason
                ? shortWastedReason(wastedReason)
                : 'That card cannot be played right now',
        );
        return null;
      }

      // FIX 5 / B6: the common case isn't actually "no zone at all" — a
      // House/Hotel with no eligible set (or a Rent card for colours the
      // player owns none of) can *still* be banked as plain cash, so the
      // branch above never fires. The player only sees the discard pile
      // sitting there dimmed with no explanation. Tell them why, without
      // blocking the (still legal) bank/property play the dim zone is
      // silently protecting them from wasting.
      if (!zones.includes('discard') && myTurnToPlay) {
        const wastedReason = wastedDiscardPlayFn(card.id);
        if (wastedReason) rejectLocal(shortWastedReason(wastedReason));
      }

      return zones;
    },
    [clientState, getLegalPlayZones, rejectLocal, wastedDiscardPlayFn],
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
