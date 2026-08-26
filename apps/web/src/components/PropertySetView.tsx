import { useCallback, useState } from 'react';
import type { Card, PropertyColor, PropertySet } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import { isSetCompleteBySize } from '../derivations';
import { useCardAttention } from '../moments/useAttention';
import { PlayingCard } from './PlayingCard';

/** What the flip badge on one board card should do, or nothing if it has none. */
export interface CardFlipInfo {
  toColor?: PropertyColor;
  disabled?: boolean;
  disabledReason?: string;
  destructive?: boolean;
  onFlip: () => void;
}

interface PropertySetViewProps {
  set: PropertySet;
  canDrag?: boolean;
  draggingCardId?: string | null;
  onCardDragStart?: (card: Card, e: React.DragEvent) => void;
  onCardDragEnd?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  /** Supplied for your own sets only — opponents' wildcards are not yours to turn over. */
  flipInfoFor?: (card: Card) => CardFlipInfo | undefined;
}

export function PropertySetView({
  set,
  canDrag = false,
  draggingCardId = null,
  onCardDragStart,
  onCardDragEnd,
  onDrop,
  flipInfoFor,
}: PropertySetViewProps) {
  const complete = isSetCompleteBySize(set);
  const needed = SET_SIZES[set.color];
  const [dragOver, setDragOver] = useState(false);
  const cardAttention = useCardAttention();

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
        {/* `playing-card--board` is a placement marker only — no stylesheet
            targets it (cards have no size tiers); it is kept because
            verification/e2e/card-aspect-ratio.spec.ts (append-only) selects
            board cards through it. */}
        <div className="property-set-view__cards">
          {set.cards.map((card, i) => {
            const flip = flipInfoFor?.(card);
            const attn = cardAttention.get(card.id);
            return (
              <PlayingCard
                key={card.id}
                card={card}
                className={`property-set-view__card playing-card--board${canDrag ? ' property-set-view__card--draggable' : ''}${draggingCardId === card.id ? ' property-set-view__card--dragging' : ''}${attn ? ` playing-card--attn-${attn}` : ''}`}
                style={{ zIndex: i + 1 }}
                draggable={canDrag}
                onDragStart={(e) => onCardDragStart?.(card, e)}
                onDragEnd={onCardDragEnd}
                onFlip={flip?.onFlip}
                flipToColor={flip?.toColor}
                flipDisabled={flip?.disabled}
                flipDisabledReason={flip?.disabledReason}
                flipDestructive={flip?.destructive}
              />
            );
          })}
          {set.house && (
            <PlayingCard
              card={set.house}
              className={`property-set-view__card playing-card--board${cardAttention.has(set.house.id) ? ` playing-card--attn-${cardAttention.get(set.house.id)}` : ''}`}
              style={{ zIndex: set.cards.length + 1 }}
            />
          )}
          {set.hotel && (
            <PlayingCard
              card={set.hotel}
              className={`property-set-view__card playing-card--board${cardAttention.has(set.hotel.id) ? ` playing-card--attn-${cardAttention.get(set.hotel.id)}` : ''}`}
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
