import type { CSSProperties } from 'react';

interface CityTitleProps {
  children: string;
  /** Title ink. */
  color: string;
  /** Hard drop-shadow colour. */
  shadow: string;
}

/**
 * The big Lilita One title across the middle of a card (a property's city,
 * the wild rent's "RENT · ANY STATE"). Geometry lives in `.playing-card__city-title`; `--title-len`
 * lets a long name ("Bhubaneswar") shrink to fit one line instead of clipping.
 *
 * `playing-card__pcard-city-title` is a legacy alias kept only because
 * verification/e2e/card-aspect-ratio.spec.ts rewrites the title through it
 * when it measures the face, so keep it stable; no stylesheet targets it.
 */
export function CityTitle({ children, color, shadow }: CityTitleProps) {
  return (
    <div
      className="playing-card__city-title playing-card__pcard-city-title"
      style={{ '--title-color': color, '--title-shadow': shadow, '--title-len': children.length } as CSSProperties}
    >
      {children}
    </div>
  );
}
