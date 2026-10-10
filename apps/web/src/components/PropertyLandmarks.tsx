import type { PropertyColor, PropertyThemeId } from '@monopoly-deal/shared';
import { useDisplaySettings } from '../hooks/useCurrency';
import { INDIA_CARD_INK } from '../indiaPropertyTheme';
import { CLASSIC_LANDMARKS } from './landmarks/classic';
import { EUROPE_LANDMARKS } from './landmarks/europe';
import { INDIA_LANDMARKS } from './landmarks/india';
import type { Landmark } from './landmarks/types';
import { USA_LANDMARKS } from './landmarks/usa';

/** One emblem per colour group for each property theme; the theme is read from the display settings. */
const LANDMARKS: Record<PropertyThemeId, Record<PropertyColor, Landmark>> = {
  india: INDIA_LANDMARKS,
  classic: CLASSIC_LANDMARKS,
  usa: USA_LANDMARKS,
  europe: EUROPE_LANDMARKS,
};

/**
 * A property's emblem, shown on the card band (a large translucent watermark),
 * the rent strip, the wild-card state pill and the table token. Fill is
 * `currentColor`, so callers set colour via the wrapping <svg>'s `style.color`.
 */
export function PropertyLandmark({
  color,
  className,
}: {
  color: PropertyColor;
  className?: string;
}) {
  const { propertyTheme } = useDisplaySettings();
  const def = LANDMARKS[propertyTheme][color];
  return (
    <svg className={className} viewBox={def.viewBox} aria-hidden focusable="false">
      {def.paths}
    </svg>
  );
}

/** The full-set row's star — always the structural ink colour, regardless of state. */
export function PropertyStarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 38" aria-hidden focusable="false">
      <polygon
        points="20,1 25,14 39,14 28,23 32,37 20,29 8,37 12,23 1,14 15,14"
        fill={INDIA_CARD_INK}
      />
    </svg>
  );
}
