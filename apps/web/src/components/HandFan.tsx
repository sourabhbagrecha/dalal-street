import { useCallback, type CSSProperties } from 'react';
import type { Card } from '@monopoly-deal/shared';
import { HAND_LIMIT } from '@monopoly-deal/shared';
import { useGameStore, useStoreSnapshot } from '../store';
import { PlayingCard } from './PlayingCard';

interface HandFanProps {
  cards: Card[];
  playerId: string;
  draggingCardId: string | null;
  selectedCardIds?: string[];
  onCardClick?: (cardId: string) => void;
  onDragStart: (card: Card, e: React.DragEvent) => void;
  onDragEnd: () => void;
}

export function HandFan({
  cards,
  playerId: _playerId,
  draggingCardId,
  selectedCardIds = [],
  onCardClick,
  onDragStart,
  onDragEnd,
}: HandFanProps) {
  const clientState = useStoreSnapshot().clientState;
  const endTurn = useGameStore((api) => api.endTurn);
  const canEndTurnFn = useGameStore((api) => api.canEndTurn);
  const overLimit = cards.length > HAND_LIMIT;
  const fanSpread = cards.length <= 1 ? 0 : Math.min(118, Math.max(72, 520 / cards.length));
  const endTurnEnabled = canEndTurnFn();
  const playsRemaining = clientState?.playsRemaining ?? 0;

  const handleEndTurn = useCallback(() => {
    endTurn();
  }, [endTurn]);

  return (
    <section className="hand-area" aria-label="Your hand">
      <div className="hand-area__meta">
        <div className="hand-area__count-pill">
          <span className="hand-area__count-label">HAND</span>
          <p className={`hand-area__count${overLimit ? ' hand-area__count--over' : ''}`}>
            {cards.length}/{HAND_LIMIT}
          </p>
        </div>
        <p className="hand-area__hint">
          {overLimit
            ? `Discard down to ${HAND_LIMIT} at the end of your turn.`
            : `Discard down to ${HAND_LIMIT} at the end of your turn.`}
        </p>
      </div>

      <div className={`hand-fan${draggingCardId ? ' hand-fan--dragging' : ''}`}>
        {cards.length === 0 ? (
          <p className="hand-fan__empty">No cards in hand</p>
        ) : (
          cards.map((card, i) => {
            const offset = i - (cards.length - 1) / 2;
            const rotate = offset * 2.2;
            const translateX = offset * fanSpread;
            const isDragging = draggingCardId === card.id;
            const isSelected = selectedCardIds.includes(card.id);

            return (
              <PlayingCard
                key={card.id}
                card={card}
                size="lg"
                className={`hand-fan__card${isDragging ? ' hand-fan__card--dragging' : ''}${isSelected ? ' hand-fan__card--selected' : ''}`}
                style={
                  {
                    ['--fan-x']: `${translateX}px`,
                    ['--fan-r']: `${rotate}deg`,
                    zIndex: isDragging ? 200 : isSelected ? 150 : i,
                  } as CSSProperties
                }
                draggable
                selected={isSelected}
                data-testid={`hand-card-${card.id}`}
                onDragStart={(e) => onDragStart(card, e)}
                onDragEnd={onDragEnd}
                onClick={onCardClick ? () => onCardClick(card.id) : undefined}
              />
            );
          })
        )}
      </div>

      <div className="hand-area__controls">
        <p className="hand-area__plays-hint">
          {playsRemaining > 0
            ? `You may still play ${playsRemaining} card${playsRemaining === 1 ? '' : 's'}.`
            : 'No plays remaining.'}
        </p>
        <button
          type="button"
          className="end-turn-btn"
          data-testid="end-turn-btn"
          disabled={!endTurnEnabled}
          onClick={handleEndTurn}
        >
          END TURN
        </button>
      </div>
    </section>
  );
}
