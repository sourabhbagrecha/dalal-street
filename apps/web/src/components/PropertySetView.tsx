import { useCallback, useState } from 'react';
import type { Card, PropertySet } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import { isSetCompleteBySize } from '../derivations';
import { PlayingCard } from './PlayingCard';

interface PropertySetViewProps {
  set: PropertySet;
  canDrag?: boolean;
  draggingCardId?: string | null;
  onCardDragStart?: (card: Card, e: React.DragEvent) => void;
  onCardDragEnd?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}

export function PropertySetView({
  set,
  canDrag = false,
  draggingCardId = null,
  onCardDragStart,
  onCardDragEnd,
  onDrop,
}: PropertySetViewProps) {
  const complete = isSetCompleteBySize(set);
  const needed = SET_SIZES[set.color];
  const [dragOver, setDragOver] = useState(false);

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!canDrag) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      if (!dragOver) setDragOver(true);
    },
    [canDrag, dragOver],
  );

  const onDragLeave = useCallback(() => setDragOver(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setDragOver(false);
      onDrop?.(e);
    },
    [onDrop],
  );

  return (
    <div
      className={`property-set-view${complete ? ' property-set-view--complete' : ''}${dragOver ? ' property-set-view--drag-over' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
    >
      {complete && (
        <div className="property-set-view__secured-banner">
          <span className="property-set-view__secured-banner-label">SET SECURED</span>
          <span className="property-set-view__secured-banner-tail" aria-hidden />
        </div>
      )}

      <div className="property-set-view__body">
        <div className="property-set-view__cards">
          {set.cards.map((card, i) => (
            <PlayingCard
              key={card.id}
              card={card}
              size="board"
              className={`property-set-view__card${canDrag ? ' property-set-view__card--draggable' : ''}${draggingCardId === card.id ? ' property-set-view__card--dragging' : ''}`}
              style={{ zIndex: i + 1 }}
              draggable={canDrag}
              onDragStart={(e) => onCardDragStart?.(card, e)}
              onDragEnd={onCardDragEnd}
            />
          ))}
          {set.house && (
            <PlayingCard
              card={set.house}
              size="board"
              className="property-set-view__card"
              style={{ zIndex: set.cards.length + 1 }}
            />
          )}
          {set.hotel && (
            <PlayingCard
              card={set.hotel}
              size="board"
              className="property-set-view__card"
              style={{ zIndex: set.cards.length + 2 }}
            />
          )}
        </div>

        <div className="property-set-view__dots" aria-label={`${set.cards.length} of ${needed}`} role="img">
          {Array.from({ length: needed }).map((_, i) => (
            <i key={i} className={i < set.cards.length ? 'is-filled' : ''} aria-hidden />
          ))}
        </div>
      </div>
    </div>
  );
}
