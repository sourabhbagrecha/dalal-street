import { useCallback, useState } from 'react';
import type { Card, ClientGameState, ClientPlayerSelf, PropertySet } from '@monopoly-deal/shared';
import { CARD_MIME, canRearrangeProperties, isDiscardExcessMode, readDraggedCardId } from '../legality';
import { completeSetCount } from '../derivations';
import { useGameStore } from '../store';
import { PropertySetView } from './PropertySetView';

interface PropertiesPanelProps {
  player: ClientPlayerSelf;
  clientState: ClientGameState;
  highlight: boolean;
  shake?: boolean;
}

export function PropertiesPanel({ player, clientState, highlight, shake }: PropertiesPanelProps) {
  const isCompleteSetFn = useGameStore((api) => api.isCompleteSet);
  const secured = completeSetCount(player, isCompleteSetFn);
  const playCard = useGameStore((api) => api.playCard);
  const rejectLocal = useGameStore((api) => api.rejectLocal);
  const getLegalPlayZones = useGameStore((api) => api.getLegalPlayZones);
  const pickPlayCommandFn = useGameStore((api) => api.pickPlayCommand);
  const send = useGameStore((api) => api.send);

  const canRearrange = canRearrangeProperties(clientState, player.id);
  const [draggingCard, setDraggingCard] = useState<Card | null>(null);

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!highlight) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    [highlight],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const cardId = readDraggedCardId(e.dataTransfer);
      if (!cardId) return;

      if (isDiscardExcessMode(clientState, player.id)) {
        rejectLocal('Use discard pile to drop excess cards');
        return;
      }

      const zones = getLegalPlayZones(cardId);
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
    },
    [clientState, player.id, playCard, rejectLocal, getLegalPlayZones, pickPlayCommandFn],
  );

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
        // Not a card already on the board — fall through to the panel's hand-drop handling.
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
    [canRearrange, onDrop, player, rejectLocal, send],
  );

  return (
    <section
      className={`properties-panel drop-zone${highlight ? ' drop-zone--active' : ''}${shake ? ' drop-zone--shake' : ''}`}
      aria-label="Your properties"
      data-testid="properties-drop"
      data-drop-zone="property"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <header className="panel-header">
        <h2 className="panel-header__title">YOUR PROPERTIES</h2>
        <span className="panel-header__badge">
          {secured} SET{secured === 1 ? '' : 'S'} HELD · 3 TO WIN
        </span>
      </header>

      <div className="properties-panel__content">
        {player.board.sets.length === 0 ? (
          <p className="properties-panel__empty">No property sets yet — drop properties here</p>
        ) : (
          player.board.sets.map((set) => (
            <PropertySetView
              key={set.id}
              set={set}
              canDrag={canRearrange}
              draggingCardId={draggingCard?.id ?? null}
              onCardDragStart={onCardDragStart}
              onCardDragEnd={onCardDragEnd}
              onDrop={(e) => onSetDrop(set, e)}
            />
          ))
        )}
      </div>
    </section>
  );
}
