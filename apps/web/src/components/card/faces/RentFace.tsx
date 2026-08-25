import type { CSSProperties } from 'react';
import type { PropertyColor, RentCard } from '@monopoly-deal/shared';
import { INDIA_PROPERTY_THEME } from '../../../indiaPropertyTheme';
import { theme } from '../../../theme';
import { ANY_BADGE, wildBadge } from '../palettes';
import { CityTitle } from '../parts/CityTitle';
import { PriceBadge } from '../parts/PriceBadge';
import { RuleBox } from '../parts/RuleBox';
import { StatePill } from '../parts/StatePill';

/**
 * Rent cards, in the same 750×1050 India style as the rest of the deck.
 *
 * Dual rent is modelled on the two-colour wildcard: two halves stacked with
 * the second printed upside-down, each carrying the RENT word and that
 * state's pill where the wild puts its city name, and a one-line rule strip
 * where the wild puts its rent ladder; a plain seam between them, no flip
 * button. Wild rent is one face on the rainbow field with an ANY STATE
 * title and its own rule box. Both carry the corner PriceBadge.
 */

function halfVars(color: PropertyColor): CSSProperties {
  const t = INDIA_PROPERTY_THEME[color];
  return { '--rf-base': t.base, '--rf-ink': t.badgeColor } as CSSProperties;
}

function RentHalf({ color, rotated }: { color: PropertyColor; rotated?: boolean }) {
  return (
    <div className={`playing-card__rf-half${rotated ? ' playing-card__rf-half--b' : ''}`} style={halfVars(color)}>
      <div className="playing-card__rf-toprow">
        <div className="playing-card__rf-spacer" aria-hidden />
        <div className="playing-card__rf-content">
          <span className="playing-card__rf-word">RENT</span>
          <StatePill color={color} />
        </div>
      </div>
      <RuleBox variant="rf">ALL RIVALS PAY RENT FOR ONE OF THESE STATES</RuleBox>
    </div>
  );
}

function DualRentFace({ card, a, b }: { card: RentCard; a: PropertyColor; b: PropertyColor }) {
  return (
    <div className="playing-card__rf-face">
      <RentHalf color={a} />
      <div className="playing-card__rf-seam" />
      <RentHalf color={b} rotated />
      <PriceBadge value={card.value} palette={wildBadge(b)} />
    </div>
  );
}

function AnyRentFace({ card }: { card: RentCard }) {
  return (
    <div className="playing-card__rf-any" style={{ background: theme.rainbow('field') }}>
      <span className="playing-card__rf-any-word">RENT</span>
      <div className="playing-card__rf-any-title">
        <CityTitle color="#2b1608" shadow="#fffdf5" rule>
          ANY STATE
        </CityTitle>
      </div>
      <RuleBox variant="rf-any">ONE RIVAL PAYS RENT FOR ANY STATE YOU OWN</RuleBox>
      <PriceBadge value={card.value} palette={ANY_BADGE} />
    </div>
  );
}

export function RentFace({ card }: { card: RentCard }) {
  const [a, b] = card.colors;
  if (card.rentType === 'dual' && a && b) return <DualRentFace card={card} a={a} b={b} />;
  return <AnyRentFace card={card} />;
}
