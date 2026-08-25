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
 * The one size rule on this part (RentFace's `nameSize` has the same
 * shape): the title prints at TITLE_MAX and shrinks only as far as it must
 * to clear the title region's own width budget. TITLE_BUDGET is that
 * region's reference px (92% of the 750px card, `.playing-card__city-title`'s
 * own `max-width`); LETTER_ADVANCE is Lilita One's measured uppercase
 * advance at TITLE_MAX (empirically: ~660-800px reference for 9-11 letter
 * names at full scale — see the CSS comment on the rule this replaces).
 * Only the deck's one 11-letter name (Bhubaneswar) is long enough to
 * actually shrink; every shorter name still prints at TITLE_MAX.
 */
const TITLE_MAX = 110.4;
const TITLE_MIN = 80;
const TITLE_BUDGET = 690;
const LETTER_ADVANCE = 0.68;

function titleSize(name: string): number {
  const widest = name.length * LETTER_ADVANCE;
  return Math.max(TITLE_MIN, Math.min(TITLE_MAX, Math.floor(TITLE_BUDGET / widest)));
}

/**
 * The big Lilita One title across the middle of a card (a property's city,
 * the wild rent's "RENT · ANY STATE"), optionally underlined with the
 * dashed rule. Geometry lives in `.playing-card__city-title`.
 *
 * `playing-card__pcard-city-title` is a legacy alias kept only because
 * verification/e2e/card-aspect-ratio.spec.ts (append-only) rewrites the
 * title through it; no stylesheet targets it. `text-overflow: ellipsis`
 * there is the backstop for exactly that path (a name swapped in without
 * going through `titleSize`, so it never sees the shrink below) and for
 * any name this budget still can't fit even at TITLE_MIN.
 */
export function CityTitle({ children, color, shadow, rule }: CityTitleProps) {
  return (
    <>
      <div
        className="playing-card__city-title playing-card__pcard-city-title"
        style={
          {
            '--title-color': color,
            '--title-shadow': shadow,
            '--title-size': titleSize(children),
          } as CSSProperties
        }
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
