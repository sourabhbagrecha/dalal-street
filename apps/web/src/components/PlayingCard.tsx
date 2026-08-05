import type { CSSProperties, DragEvent } from 'react';
import type { ActionType, Card, PropertyColor } from '@monopoly-deal/shared';
import { RENT_TABLE } from '@monopoly-deal/shared';
import { cardAccent, cardTitle } from '../derivations';
import { theme } from '../theme';

interface PlayingCardProps {
  card: Card;
  size?: 'sm' | 'md' | 'lg' | 'board';
  style?: CSSProperties;
  className?: string;
  draggable?: boolean;
  'data-testid'?: string;
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onClick?: () => void;
  selected?: boolean;
}

const sizeClass = {
  sm: 'playing-card--sm',
  md: 'playing-card--md',
  lg: 'playing-card--lg',
  board: 'playing-card--board',
};

const ACTION_BLURBS: Partial<Record<ActionType, string>> = {
  pass_go: 'Draw two extra cards from the deck.',
  sly_deal: 'Steal one property from an incomplete set of a rival.',
  forced_deal: 'Swap one of your properties with a rival incomplete-set property.',
  deal_breaker: 'Steal a complete property set from a rival.',
  debt_collector: 'Force one rival to pay you $5M.',
  its_my_birthday: 'Every rival pays you $2M. Happy birthday!',
  just_say_no: 'Cancel an action played against you.',
  double_the_rent: 'Play with a Rent card to double the charge.',
  house: 'Add to a complete set to boost its rent by $3M.',
  hotel: 'Add to a complete set that already has a House to boost rent by $4M.',
};

function cardKindLabel(card: Card): string {
  if (card.kind === 'money') return 'BANK NOTE';
  if (card.kind === 'property') return 'PROPERTY';
  if (card.kind === 'property_wild') return 'PROPERTY WILD';
  if (card.kind === 'rent') return 'RENT CARD';
  if (card.kind === 'action') {
    if (card.action === 'house') return 'HOUSE';
    if (card.action === 'hotel') return 'HOTEL';
    return 'ACTION';
  }
  return 'CARD';
}

function shortPropertyName(name: string): string {
  return name
    .replace(/\bAvenue\b/gi, 'Ave.')
    .replace(/\bPlace\b/gi, 'Pl.')
    .replace(/\bRailroad\b/gi, 'R.R.')
    .replace(/\bCompany\b/gi, 'Co.');
}

function headerTitle(card: Card, size: 'sm' | 'md' | 'lg' | 'board'): string {
  if (card.kind === 'property') {
    const short = shortPropertyName(card.name);
    return size === 'sm' ? short : short.toUpperCase();
  }
  if (card.kind === 'money') return theme.formatMoney(card.amount);
  if (card.kind === 'rent') return card.rentType === 'wild' ? 'WILD RENT' : 'RENT';
  if (card.kind === 'property_wild') {
    return card.colors.length === 0 ? 'WILDCARD' : cardTitle(card).toUpperCase();
  }
  if (card.kind === 'action') return (theme.actionNames[card.action] ?? card.action).toUpperCase();
  return 'CARD';
}

function cardBlurb(card: Card): string {
  if (card.kind === 'money') {
    return 'Bank it for later, or hand it over to settle a debt.';
  }
  if (card.kind === 'property') {
    return `Rent ${RENT_TABLE[card.color].map((r) => theme.formatMoney(r)).join(' / ')}.`;
  }
  if (card.kind === 'property_wild') {
    if (card.colors.length === 0) {
      return 'Stands in for any one property. Has no cash value.';
    }
    return card.colors
      .map((c) => {
        const label = theme.propertyNames[c] ?? c;
        return `${label}: ${RENT_TABLE[c].map((r) => theme.formatMoney(r)).join('/')}`;
      })
      .join(' · ');
  }
  if (card.kind === 'rent') {
    if (card.rentType === 'wild') {
      return 'Charge one rival rent for any colour you own.';
    }
    return 'Charge every rival rent for one of these two colours.';
  }
  if (card.kind === 'action') {
    return ACTION_BLURBS[card.action] ?? 'Play this action on your turn.';
  }
  return '';
}

function rentSummary(color: PropertyColor): string {
  return RENT_TABLE[color].map((r) => theme.formatMoney(r)).join(' / ');
}

function headerStyle(card: Card): CSSProperties {
  if (card.kind === 'rent' && card.rentType === 'dual' && card.colors.length >= 2) {
    const a = theme.propertyColors[card.colors[0]!] ?? '#888';
    const b = theme.propertyColors[card.colors[1]!] ?? '#888';
    return {
      background: `linear-gradient(135deg, ${a} 0%, ${a} 48%, ${b} 52%, ${b} 100%)`,
    };
  }
  if (card.kind === 'property_wild' && card.colors.length === 0) {
    return {
      background:
        'repeating-linear-gradient(135deg, #c94e8b 0 14px, #f59b1a 14px 28px, #fce014 28px 42px, #1b8a3c 42px 56px, #1f72c4 56px 70px)',
    };
  }
  if (card.kind === 'property_wild' && card.colors.length >= 2) {
    const a = theme.propertyColors[card.colors[0]!] ?? '#888';
    const b = theme.propertyColors[card.colors[1]!] ?? '#888';
    return {
      background: `linear-gradient(180deg, ${a} 0%, ${a} 50%, ${b} 50%, ${b} 100%)`,
    };
  }
  const accent = cardAccent(card);
  if (accent.includes('gradient')) {
    return { background: accent };
  }
  return { background: accent };
}

function headerTextClass(card: Card): string {
  if (card.kind === 'action') return 'playing-card__header-title playing-card__header-title--light';
  if (card.kind === 'property_wild' && card.colors.length === 0) {
    return 'playing-card__header-title playing-card__header-title--light';
  }
  if (card.kind === 'property') {
    const darkHeaders = new Set(['dark_blue', 'brown', 'green', 'railroad', 'red']);
    if (darkHeaders.has(card.color)) {
      return 'playing-card__header-title playing-card__header-title--light';
    }
  }
  if (card.kind === 'property_wild' && card.colors.length > 0) {
    return 'playing-card__header-title playing-card__header-title--light';
  }
  return 'playing-card__header-title';
}

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
  const isMoney = card.kind === 'money';
  const isProperty = card.kind === 'property';
  const showBlurb = size !== 'sm';

  return (
    <div
      className={`playing-card ${sizeClass[size]} ${className}${selected ? ' playing-card--selected' : ''}${isMoney ? ' playing-card--money' : ''}${isProperty ? ' playing-card--property' : ''}`}
      style={style}
      title={
        isProperty
          ? `${card.name} — Rent ${rentSummary(card.color)}`
          : cardTitle(card)
      }
      draggable={draggable}
      data-testid={testId}
      data-card-id={card.id}
      data-card-kind={card.kind}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      {isMoney ? (
        <div className="playing-card__money-face" style={headerStyle(card)}>
          <span className="playing-card__money-amount">{headerTitle(card, size)}</span>
        </div>
      ) : (
        <>
          <div className="playing-card__header" style={headerStyle(card)}>
            <span className={headerTextClass(card)}>{headerTitle(card, size)}</span>
          </div>

          <div className="playing-card__body">
            {showBlurb && cardBlurb(card) && (
              <p className="playing-card__blurb">{cardBlurb(card)}</p>
            )}
            {size === 'sm' && isProperty && (
              <span className="playing-card__title">{shortPropertyName(card.name)}</span>
            )}

            <div className="playing-card__footer">
              <span className="playing-card__kind">{cardKindLabel(card)}</span>
              {card.value > 0 ? (
                <span className="playing-card__value">{theme.formatMoney(card.value)}</span>
              ) : (
                <span className="playing-card__value playing-card__value--none">—</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
