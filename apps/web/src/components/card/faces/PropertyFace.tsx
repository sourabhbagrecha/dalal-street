import type { CSSProperties } from 'react';
import type { PropertyCard } from '@monopoly-deal/shared';
import { RENT_TABLE } from '@monopoly-deal/shared';
import {
  INDIA_PROPERTY_THEME,
  PREMIUM_PROPERTY_COLOR,
  PREMIUM_RENT_CAPTION,
  PROPERTY_SET_TAGLINE,
} from '../../../indiaPropertyTheme';
import { PropertyLandmark } from '../../PropertyLandmarks';
import { propertyBadge } from '../palettes';
import { CityTitle } from '../parts/CityTitle';
import { PriceBadge } from '../parts/PriceBadge';
import { RentLadder } from '../parts/RentLadder';
import { StatePill } from '../parts/StatePill';

/**
 * Per-state colour tokens for the property face (see indiaPropertyTheme.ts),
 * handed to cards.css once as custom properties on the face element.
 */
function propertyVars(card: PropertyCard): CSSProperties {
  const t = INDIA_PROPERTY_THEME[card.color];
  return {
    '--p-base': t.base,
    '--p-band-bg': t.bandBg,
    '--p-tagline-color': t.taglineColor,
    '--p-glyph-color': t.badgeColor,
    '--p-row-bg': t.rowBg,
    '--p-mini-border-n': t.miniCardBorderPx ?? 5,
  } as CSSProperties;
}

/**
 * The property card: state band across the top (state pill, tagline,
 * landmark glyph, PREMIUM ribbon on the top set), the corner price badge,
 * the city title over a dashed rule, and the rent ladder. Four absolutely-
 * positioned regions on the 750×1050 canvas — position/size in %, everything
 * else in `calc(Npx * var(--card-scale))` — see `.playing-card__pcard*` in
 * cards.css. The card root carries `--rent-rows` (the shell sets it) so the
 * ladder's own scale can depend on how many rows this state has.
 */
export function PropertyFace({ card }: { card: PropertyCard }) {
  const t = INDIA_PROPERTY_THEME[card.color];
  const premium = card.color === PREMIUM_PROPERTY_COLOR;
  return (
    <div className="playing-card__pcard" style={propertyVars(card)}>
      <div className="playing-card__pcard-band">
        <div className="playing-card__pcard-pill">
          <StatePill color={card.color} />
        </div>
        <div className="playing-card__pcard-tagline">{PROPERTY_SET_TAGLINE[card.color]}</div>
        <PropertyLandmark color={card.color} className="playing-card__pcard-glyph" />
        {premium && <div className="playing-card__pcard-ribbon">★ PREMIUM</div>}
      </div>
      <PriceBadge value={card.value} palette={propertyBadge(card.color)} />
      <div className="playing-card__pcard-city">
        <CityTitle color={t.cityColor} shadow={t.cityShadow} rule>
          {card.name}
        </CityTitle>
      </div>
      <RentLadder rents={RENT_TABLE[card.color]} fullSetCaption={premium ? PREMIUM_RENT_CAPTION : undefined} />
    </div>
  );
}
