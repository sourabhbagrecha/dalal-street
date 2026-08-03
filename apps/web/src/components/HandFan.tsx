import type { Card } from '@monopoly-deal/shared';
import { HAND_LIMIT } from '@monopoly-deal/shared';
import { PlayingCard } from './PlayingCard';

interface HandFanProps {
  cards: Card[];
}

export function HandFan({ cards }: HandFanProps) {
  const overLimit = cards.length > HAND_LIMIT;
  const fanSpread = cards.length <= 1 ? 0 : Math.min(28, 120 / cards.length);

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

            return (
              <PlayingCard
                key={card.id}
                card={card}
                size="lg"
                className="hand-fan__card"
                style={{
                  transform: `translateX(${translateX}px) rotate(${rotate}deg)`,
                  zIndex: i,
                }}
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
        <button type="button" className="end-turn-btn" disabled>
          END TURN
        </button>
      </div>
    </section>
  );
}
