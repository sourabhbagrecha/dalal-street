import type { CSSProperties } from 'react';
import type { PropertyColor } from '@monopoly-deal/shared';
import { INDIA_PROPERTY_THEME } from '../../../indiaPropertyTheme';
import { theme } from '../../../theme';

/**
 * The rounded state pill the property card wears in its band. The name is
 * the band's one line of text, so it is set as large as fits: each state's
 * theme carries its own `stateNameSize` (long names like "Uttar Pradesh"
 * shrink to stay on one line). Geometry is in `.playing-card__statepill`.
 */
export function StatePill({ color }: { color: PropertyColor }) {
  const t = INDIA_PROPERTY_THEME[color];
  return (
    <span
      className="playing-card__statepill"
      style={{ '--pill-bg': t.badgeBg, '--pill-color': t.badgeColor, '--pill-size': t.stateNameSize } as CSSProperties}
    >
      {theme.propertyNames[color]}
    </span>
  );
}
