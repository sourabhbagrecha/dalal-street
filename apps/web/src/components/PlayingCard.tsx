import type { CSSProperties } from 'react';
import type { Card } from '@monopoly-deal/shared';
import { cardAccent, cardTitle } from '../derivations';

interface PlayingCardProps {
  card: Card;
  size?: 'sm' | 'md' | 'lg';
  style?: CSSProperties;
  className?: string;
}

const sizeClass = { sm: 'playing-card--sm', md: 'playing-card--md', lg: 'playing-card--lg' };

export function PlayingCard({ card, size = 'md', style, className = '' }: PlayingCardProps) {
  const accent = cardAccent(card);
  const isGradient = accent.includes('gradient');

  return (
    <div
      className={`playing-card ${sizeClass[size]} ${className}`}
      style={{
        ...style,
        ...(isGradient ? { background: accent } : { '--card-accent': accent }),
      }}
      title={cardTitle(card)}
    >
      <div className="playing-card__stripe" />
      <div className="playing-card__body">
        <span className="playing-card__title">{cardTitle(card)}</span>
        {card.value > 0 && <span className="playing-card__value">{card.value}M</span>}
      </div>
    </div>
  );
}
