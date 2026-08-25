import type { CSSProperties } from 'react';
import type { PropertyColor, PropertyWildCard } from '@monopoly-deal/shared';
import { RENT_TABLE, WILD_CITY_NAMES } from '@monopoly-deal/shared';
import { INDIA_PROPERTY_THEME } from '../../../indiaPropertyTheme';
import { theme } from '../../../theme';
import { PropertyLandmark, PropertyStarIcon } from '../../PropertyLandmarks';
import { wildBadge } from '../palettes';
import { PriceBadge } from '../parts/PriceBadge';

/**
 * The two-colour property wildcard. Its half markup and `wd-*` styling are
 * deliberately private to this face — the state pill, city, rent-ladder
 * chips and seam are tuned for two stacked halves and are not the property
 * card's parts. It shares only the shell, the PriceBadge and the flip
 * button (rendered by the shell).
 */

/** Per-half colour tokens, read from the same per-state theme the property
    card uses (see indiaPropertyTheme.ts). */
function wildDuoHalfVars(color: PropertyColor): CSSProperties {
  const t = INDIA_PROPERTY_THEME[color];
  return {
    '--wd-base': t.base,
    '--wd-badge-bg': t.badgeBg,
    '--wd-badge-color': t.badgeColor,
  } as CSSProperties;
}

/** One rent-ladder chip: a card count (as a row of tiny blocks, or a star on
    the full-set entry) over its price. The pill carries its own `aria-label`
    restating the count for screen readers. */
function WildDuoPill({ count, amount, isFull }: { count: number; amount: number; isFull: boolean }) {
  const amountText = `${theme.currencySymbol}${amount}`;
  const label = isFull ? `Full set: ${amountText}` : `${count} card${count > 1 ? 's' : ''}: ${amountText}`;
  return (
    <div
      className={`playing-card__wd-pill${isFull ? ' playing-card__wd-pill--full' : ''}`}
      role="group"
      aria-label={label}
    >
      {isFull ? (
        <PropertyStarIcon className="playing-card__wd-pill-star" />
      ) : (
        <span className="playing-card__wd-pill-blocks" aria-hidden="true">
          {Array.from({ length: count }).map((_, i) => (
            <span key={i} className="playing-card__wd-pill-block" />
          ))}
        </span>
      )}
      <span className="playing-card__wd-pill-amount">{amountText}</span>
    </div>
  );
}

/** One face of a two-way wildcard: state badge, the wild city name, and that
    colour's own rent ladder as a row of chips. The other half is the same
    component again, rotated a half turn (see .playing-card__wd-half--b) —
    "the bottom half printed upside-down" is the whole trick. */
function WildDuoHalf({ color, rotated }: { color: PropertyColor; rotated?: boolean }) {
  const rents = RENT_TABLE[color];
  return (
    <div
      className={`playing-card__wd-half${rotated ? ' playing-card__wd-half--b' : ''}`}
      style={wildDuoHalfVars(color)}
    >
      <div className="playing-card__wd-toprow">
        <div className="playing-card__wd-spacer" aria-hidden />
        <div className="playing-card__wd-content">
          <span className="playing-card__wd-statepill">
            <PropertyLandmark color={color} className="playing-card__wd-statepill-icon" />
            <span>{theme.propertyNames[color]}</span>
          </span>
          <span className="playing-card__wd-city">{WILD_CITY_NAMES[color]}</span>
        </div>
      </div>
      <div className="playing-card__wd-rentrow">
        <div className="playing-card__wd-pills">
          {rents.map((amount, idx) => (
            <WildDuoPill key={idx} count={idx + 1} amount={amount} isFull={idx === rents.length - 1} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Two state faces stacked top/bottom (the second printed upside-down), a
 * seam between them the shell drops the flip control into, and one corner
 * badge naming the card's price in a single colour — the bottom half's.
 * `colors` arrives already ordered active-colour-first, so the colour the
 * card is currently counting as always takes the top (right-side-up) half.
 */
export function WildDuoFace({ card, colors }: { card: PropertyWildCard; colors: PropertyColor[] }) {
  const [a, b] = colors;
  if (!a || !b) return null;

  return (
    <div className="playing-card__wd-face">
      <WildDuoHalf color={a} />
      <div className="playing-card__wd-seam" />
      <WildDuoHalf color={b} rotated />
      <PriceBadge value={card.value} palette={wildBadge(b)} />
    </div>
  );
}
