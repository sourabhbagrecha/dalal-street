import type { CSSProperties } from 'react';
import type { PropertyColor } from '@monopoly-deal/shared';
import { INDIA_PROPERTY_THEME } from '../../../indiaPropertyTheme';
import { theme } from '../../../theme';
import { PropertyLandmark } from '../../PropertyLandmarks';

/**
 * The rounded state pill — landmark icon plus state name — the property
 * card wears in its band and the rent card wears on each half. Geometry
 * (font, padding, icon size) is fixed in `.playing-card__statepill`; the
 * colours come from the state's own theme.
 */
export function StatePill({ color }: { color: PropertyColor }) {
  const t = INDIA_PROPERTY_THEME[color];
  return (
    <span
      className="playing-card__statepill"
      style={{ '--pill-bg': t.badgeBg, '--pill-color': t.badgeColor } as CSSProperties}
    >
      <PropertyLandmark color={color} className="playing-card__statepill-icon" />
      <span>{theme.propertyNames[color]}</span>
    </span>
  );
}
