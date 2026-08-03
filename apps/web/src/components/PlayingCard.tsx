import type { CSSProperties, DragEvent } from 'react';
import type { Card } from '@monopoly-deal/shared';
import { cardAccent, cardTitle } from '../derivations';

interface PlayingCardProps {
  card: Card;
  size?: 'sm' | 'md' | 'lg';
  style?: CSSProperties;
  className?: string;
  draggable?: boolean;
  'data-testid'?: string;
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onClick?: () => void;
  selected?: boolean;
}

const sizeClass = { sm: 'playing-card--sm', md: 'playing-card--md', lg: 'playing-card--lg' };

export function PlayingCard({
  card,
  size = 'md',
  style,
  className = '',
  draggable,
  'data-testid': testId,
  onDragStart,
  onDragEnd,
  onClick,
  selected,
}: PlayingCardProps) {
  const accent = cardAccent(card);
  const isGradient = accent.includes('gradient');

  return (
    <div
      className={`playing-card ${sizeClass[size]} ${className}${selected ? ' playing-card--selected' : ''}`}
      style={{
        ...style,
        ...(isGradient ? { background: accent } : { '--card-accent': accent }),
      }}
      title={cardTitle(card)}
      draggable={draggable}
      data-testid={testId}
      data-card-id={card.id}
      data-card-kind={card.kind}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      <div className="playing-card__stripe" />
      <div className="playing-card__body">
        <span className="playing-card__title">{cardTitle(card)}</span>
        {card.value > 0 && <span className="playing-card__value">{card.value}M</span>}
      </div>
    </div>
  );
}
