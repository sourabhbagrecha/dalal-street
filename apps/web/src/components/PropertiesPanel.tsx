import { useCallback, useEffect, useState } from 'react';
import type { Card, ClientGameState, ClientPlayerSelf, PlayTarget, PropertySet } from '@monopoly-deal/shared';
import { CARD_MIME, canRearrangeProperties, isDiscardExcessMode, readDraggedCardId } from '../legality';
import { useAttentionFor, useBankAttention } from '../moments/useAttention';
import type { HighlightKind } from '../moments/types';
import { useGameStore } from '../store';
import { isFlippableWild, setFace } from '../wildFaceStore';
import { CashPile } from './CashPile';
import { BuildingChoicePrompt } from './GamePrompts';
import type { CardFlipInfo } from './PropertySetView';
import { PropertySetView } from './PropertySetView';

interface PropertiesPanelProps {
  player: ClientPlayerSelf;
  clientState: ClientGameState;
  highlight: boolean;
  dim?: boolean;
  shake?: boolean;
}

/** A House/Hotel dropped on the board is ambiguous — bankable cash or a building — held until the player picks one. */
interface HeldBuildingChoice {
  card: Card;
  target?: PlayTarget;
}

export function PropertiesPanel({
  player,
  clientState,
  highlight,
  dim,
  shake,
}: PropertiesPanelProps) {
  const playCard = useGameStore((api) => api.playCard);
  const rejectLocal = useGameStore((api) => api.rejectLocal);
  const getLegalPlayZones = useGameStore((api) => api.getLegalPlayZones);
  const pickPlayCommandFn = useGameStore((api) => api.pickPlayCommand);
  const send = useGameStore((api) => api.send);
  const removalCost = useGameStore((api) => api.removalCost);
  const isCompleteSetFn = useGameStore((api) => api.isCompleteSet);

  const canRearrange = canRearrangeProperties(clientState, player.id);
  const rawAttention = useAttentionFor(player.id);
  const boardAttention: HighlightKind | null =
    rawAttention === 'stolen' || rawAttention === 'received' || rawAttention === 'targeted' ? rawAttention : null;
  const bankAttention = useBankAttention(player.id);
  const [draggingCard, setDraggingCard] = useState<Card | null>(null);
  const [heldChoice, setHeldChoice] = useState<HeldBuildingChoice | null>(null);

  // A card can leave the hand while the choice sits open — an interrupt resolving,
  // the turn clock expiring. Drop the held choice rather than firing a command for
  // a card that is gone (mirrors GameCenter's HeldWastedPlay cleanup).
  useEffect(() => {
    if (!heldChoice) return;
    const stillHoldable =
      clientState.currentPlayerId === player.id &&
      player.hand.some((c) => c.id === heldChoice.card.id);
    if (!stillHoldable) setHeldChoice(null);
  }, [heldChoice, clientState.currentPlayerId, player.id, player.hand]);

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!highlight) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    [highlight],
  );

  /**
   * The panel's general drop handler — property cards land here exactly as
   * before (creating a new set on the fly), and everything else (money,
   * rent, generic action cards) now banks the same way, since the bank is no
   * longer a separate drop zone. A House/Hotel is ambiguous between the two,
   * so it's held for a cash-or-build choice rather than banked outright —
   * but only when there is actually somewhere to build; otherwise there is
   * nothing to choose between.
   */
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const cardId = readDraggedCardId(e.dataTransfer);
      if (!cardId) return;

      if (isDiscardExcessMode(clientState, player.id)) {
        rejectLocal('Use discard pile to drop excess cards');
        return;
      }

      const card = player.hand.find((c) => c.id === cardId);
      const zones = getLegalPlayZones(cardId);

      if (card?.kind === 'property' || card?.kind === 'property_wild') {
        if (!zones.includes('property')) {
          rejectLocal('Cannot play this card as a property');
          return;
        }
        const cmd = pickPlayCommandFn(cardId, 'property');
        if (!cmd) {
          rejectLocal('Cannot play this card as a property');
          return;
        }
        playCard(cardId, 'property', cmd.target);
        return;
      }

      if (!zones.includes('bank')) {
        rejectLocal('Cannot play this card here');
        return;
      }
      const cmd = pickPlayCommandFn(cardId, 'bank');
      if (!cmd) {
        rejectLocal('Cannot bank this card here');
        return;
      }

      const isBuildingCard = card?.kind === 'action' && (card.action === 'house' || card.action === 'hotel');
      if (isBuildingCard && zones.includes('discard')) {
        setHeldChoice({ card, target: cmd.target });
        return;
      }

      playCard(cardId, 'bank', cmd.target);
    },
    [clientState, player.id, player.hand, playCard, rejectLocal, getLegalPlayZones, pickPlayCommandFn],
  );

  const onConfirmCash = useCallback(() => {
    if (!heldChoice) return;
    playCard(heldChoice.card.id, 'bank', heldChoice.target);
    setHeldChoice(null);
  }, [heldChoice, playCard]);

  const onConfirmBuild = useCallback(() => {
    if (!heldChoice) return;
    const cmd = pickPlayCommandFn(heldChoice.card.id, 'discard');
    if (!cmd) {
      rejectLocal('Cannot build with this card right now');
      setHeldChoice(null);
      return;
    }
    playCard(heldChoice.card.id, 'discard', cmd.target);
    setHeldChoice(null);
  }, [heldChoice, playCard, pickPlayCommandFn, rejectLocal]);

  const onCardDragStart = useCallback(
    (card: Card, e: React.DragEvent) => {
      if (!canRearrange || (card.kind !== 'property' && card.kind !== 'property_wild')) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData(CARD_MIME, card.id);
      e.dataTransfer.setData('text/plain', card.id);
      e.dataTransfer.effectAllowed = 'move';
      e.stopPropagation();
      setDraggingCard(card);
    },
    [canRearrange],
  );

  const onCardDragEnd = useCallback(() => {
    setDraggingCard(null);
  }, []);

  const onSetDrop = useCallback(
    (set: PropertySet, e: React.DragEvent) => {
      const cardId = readDraggedCardId(e.dataTransfer);
      setDraggingCard(null);
      if (!cardId) return;

      const boardCard = player.board.sets.flatMap((s) => s.cards).find((c) => c.id === cardId);
      if (!boardCard) {
        const handCard = player.hand.find((c) => c.id === cardId);

        // A House/Hotel dropped directly on a set is an unambiguous "build here" —
        // no need for the cash-or-build prompt, or BuildingPrompt's set choice,
        // since the player already picked the set with the drop itself.
        if (handCard?.kind === 'action' && (handCard.action === 'house' || handCard.action === 'hotel')) {
          e.preventDefault();
          e.stopPropagation();
          const building = handCard.action;
          const eligible =
            isCompleteSetFn(set) && (building === 'house' ? !set.house : !set.hotel);
          if (!eligible) {
            rejectLocal(
              building === 'house'
                ? 'This set cannot take a house yet'
                : 'This set needs a house before a hotel',
            );
            return;
          }
          const cmd = pickPlayCommandFn(cardId, 'discard');
          if (!cmd) {
            rejectLocal('Cannot build with this card right now');
            return;
          }
          playCard(cardId, 'discard', cmd.target);
          return;
        }

        // A wildcard dropped onto a specific set is an unambiguous statement of
        // which colour the player wants, so it turns the card over rather than
        // refusing the drop — the stored face only decides vaguer gestures.
        if (handCard && isFlippableWild(handCard) && handCard.kind === 'property_wild') {
          if (!handCard.colors.includes(set.color)) {
            e.preventDefault();
            e.stopPropagation();
            rejectLocal('Wild cannot be that color');
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          setFace(cardId, set.color);
          const zones = getLegalPlayZones(cardId);
          if (!zones.includes('property')) {
            rejectLocal('Cannot play this card as a property');
            return;
          }
          playCard(cardId, 'property', { assignedColor: set.color });
          return;
        }
        // Anything else — hand it to the panel's ordinary hand-drop handling.
        // Stop the event here: the panel's own onDrop also listens on the
        // bubbling path, and letting it fire twice replays the card after it
        // has already left the hand ("Card not in hand" + a rejection shake).
        e.stopPropagation();
        onDrop(e);
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      if (!canRearrange) {
        rejectLocal('Not your turn');
        return;
      }
      if (boardCard.kind === 'property' && boardCard.color !== set.color) {
        rejectLocal('Natural property cannot change color');
        return;
      }
      if (
        boardCard.kind === 'property_wild' &&
        boardCard.colors.length > 0 &&
        !boardCard.colors.includes(set.color)
      ) {
        rejectLocal('Wild cannot be that color');
        return;
      }
      send({
        type: 'REARRANGE_PROPERTY',
        playerId: player.id,
        cardId,
        toColor: set.color,
        toSetId: set.id,
      });
    },
    [
      canRearrange,
      getLegalPlayZones,
      isCompleteSetFn,
      onDrop,
      pickPlayCommandFn,
      playCard,
      player,
      rejectLocal,
      send,
    ],
  );

  /**
   * A board wildcard's flip is just `REARRANGE_PROPERTY` to its other colour,
   * with no `toSetId` — the engine already picks the sensible destination set,
   * and dragging remains the way to choose a specific one.
   */
  const flipInfoFor = useCallback(
    (card: Card): CardFlipInfo | undefined => {
      if (!isFlippableWild(card) || card.kind !== 'property_wild') return undefined;
      const current = card.assignedColor;
      const toColor = card.colors.find((c) => c !== current);
      if (!toColor) return undefined;
      const cost = removalCost(card.id);
      return {
        toColor,
        disabled: !canRearrange,
        disabledReason: 'You can only flip board cards on your own turn',
        destructive: Boolean(cost?.breaksCompleteSet || cost?.orphansBuilding),
        onFlip: () =>
          send({
            type: 'REARRANGE_PROPERTY',
            playerId: player.id,
            cardId: card.id,
            toColor,
          }),
      };
    },
    [canRearrange, player, removalCost, send],
  );

  return (
    <>
      <section
        className={`properties-panel attn-host drop-zone${highlight ? ' drop-zone--active' : ''}${dim ? ' drop-zone--dim' : ''}${shake ? ' drop-zone--shake' : ''}`}
        aria-label="Your properties and bank"
        data-testid="properties-drop"
        data-drop-zone="property bank"
        data-attention={boardAttention ?? undefined}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div className="properties-panel__content">
          <CashPile cards={player.board.bank} attention={bankAttention} />
          {player.board.sets.length === 0 ? (
            <p className="properties-panel__empty empty-note">No property sets yet — drop properties here</p>
          ) : (
            player.board.sets.map((set) => (
              <PropertySetView
                key={set.id}
                set={set}
                canDrag={false}
                draggingCardId={draggingCard?.id ?? null}
                onCardDragStart={onCardDragStart}
                onCardDragEnd={onCardDragEnd}
                onDrop={(e) => onSetDrop(set, e)}
                flipInfoFor={flipInfoFor}
              />
            ))
          )}
        </div>
      </section>

      {heldChoice && (
        <BuildingChoicePrompt
          card={heldChoice.card}
          canBuild={player.board.sets.some(
            (set) =>
              isCompleteSetFn(set) &&
              (heldChoice.card.kind === 'action' && heldChoice.card.action === 'house'
                ? !set.house
                : !set.hotel),
          )}
          onConfirmCash={onConfirmCash}
          onConfirmBuild={onConfirmBuild}
          onCancel={() => setHeldChoice(null)}
        />
      )}
    </>
  );
}
