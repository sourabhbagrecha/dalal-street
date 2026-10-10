import type { CSSProperties } from 'react';
import type { PropertyColor } from '@monopoly-deal/shared';
import { useDisplaySettings } from '../../../hooks/useCurrency';
import { INDIA_PROPERTY_THEME } from '../../../indiaPropertyTheme';
import { theme } from '../../../theme';

/**
 * The band is 496px wide; Archivo 900 caps run about 0.86em a letter and the
 * pill adds 1.1em of padding, so this is the largest size that keeps `label` on one line.
 */
function fitPillName(label: string): number {
  return Math.min(72, Math.floor(496 / (label.length * 0.86 + 1.1)));
}

/**
 * The rounded state pill the property card wears in its band. The name is
 * the band's one line of text, so it is set as large as fits: the India
 * theme keeps each state's hand-fitted `stateNameSize`, and any other theme's
 * label is fitted from its length (see `fitPillName`). Geometry is in `.playing-card__statepill`.
 */
export function StatePill({ color }: { color: PropertyColor }) {
  const { propertyTheme } = useDisplaySettings();
  const t = INDIA_PROPERTY_THEME[color];
  const label = theme.propertyNames[color] ?? color;
  const size = propertyTheme === 'india' ? t.stateNameSize : fitPillName(label);
  return (
    <span
      className="playing-card__statepill"
      style={{ '--pill-bg': t.badgeBg, '--pill-color': t.badgeColor, '--pill-size': size } as CSSProperties}
    >
      {label}
    </span>
  );
}
