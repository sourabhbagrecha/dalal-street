import { useCallback } from 'react';
import type { Card } from '@monopoly-deal/shared';
import { HAND_LIMIT } from '@monopoly-deal/shared';
import { canEndTurn } from '../legality';
import { useGameStore } from '../store';
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
  playerId,
  draggingCardId,
  selectedCardIds = [],
  onCardClick,
  onDragStart,
  onDragEnd,
}: HandFanProps) {
  const state = useGameStore((s) => s.state);
  const endTurn = useGameStore((s) => s.endTurn);
  const overLimit = cards.length > HAND_LIMIT;
  const fanSpread = cards.length <= 1 ? 0 : Math.min(28, 120 / cards.length);
  const endTurnEnabled = canEndTurn(state, playerId);

  const handleEndTurn = useCallback(() => {
    endTurn();
  }, [endTurn]);

  return (
    <section className="hand-area" aria-label="Your hand">
      <div className="hand-fan">
        {cards.length === 0 ? (
          <p className="hand-fan__empty">No cards in hand</p>
        ) : (
          cards.map((card, i) => {
            const offset = i - (cards.length - 1) / 2;
            const rotate = offset * fanSpread * 0.15;
            const translateX = offset * fanSpread;
            const isDragging = draggingCardId === card.id;
            const isSelected = selectedCardIds.includes(card.id);

            return (
              <PlayingCard
                key={card.id}
                card={card}
                size="lg"
                className={`hand-fan__card${isDragging ? ' hand-fan__card--dragging' : ''}`}
                style={{
                  transform: `translateX(${translateX}px) rotate(${rotate}deg)`,
                  zIndex: isDragging ? 200 : isSelected ? 150 : i,
                }}
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
        <p className={`hand-area__count${overLimit ? ' hand-area__count--over' : ''}`}>
          {cards.length} card{cards.length === 1 ? '' : 's'} in hand
          {overLimit && ` (discard ${cards.length - HAND_LIMIT})`}
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
