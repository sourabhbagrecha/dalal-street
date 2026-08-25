import type { CSSProperties } from 'react';

interface CityTitleProps {
  children: string;
  /** Title ink. */
  color: string;
  /** Hard drop-shadow colour — also the dashed rule beneath, when shown. */
  shadow: string;
  /** Draw the dashed rule under the title (the property card's). */
  rule?: boolean;
}

/**
 * The big Lilita One title across the middle of a card (a property's city,
 * the wild rent's "RENT · ANY STATE"), optionally underlined with the
 * dashed rule. Geometry lives in `.playing-card__city-title`.
 *
 * `playing-card__pcard-city-title` is a legacy alias kept only because
 * verification/e2e/card-aspect-ratio.spec.ts (append-only) rewrites the
 * title through it; no stylesheet targets it.
 */
export function CityTitle({ children, color, shadow, rule }: CityTitleProps) {
  return (
    <>
      <div
        className="playing-card__city-title playing-card__pcard-city-title"
        style={{ '--title-color': color, '--title-shadow': shadow } as CSSProperties}
      >
        {children}
      </div>
      {rule && (
        <span
          className="playing-card__city-rule"
          style={{ '--title-shadow': shadow } as CSSProperties}
          aria-hidden
        />
      )}
    </>
  );
}
