import type { CSSProperties } from 'react';
import type { PropertyColor, RentCard } from '@monopoly-deal/shared';
import { INDIA_PROPERTY_THEME } from '../../../indiaPropertyTheme';
import { theme } from '../../../theme';
import { RENT_BADGE } from '../palettes';
import { PriceBadge } from '../parts/PriceBadge';
import { PropertyLandmark } from '../../PropertyLandmarks';

/**
 * Rent cards, as a type poster.
 *
 * One layout for both kinds (750×1050 reference like every other face): a
 * starburst RENT sticker top right, then the state names at poster scale in
 * their own colour, each over a strip of its landmark; wild rent swaps the
 * names for a giant rainbow "ANY STATE". An ink footer says who pays — three
 * seats, all lit for a dual rent (every opponent) or one lit for a wild rent
 * (a single opponent).
 */

/**
 * The one size rule on this face (PriceBadge has the same shape): a state name
 * prints at NAME_MAX and shrinks only as far as it must to stay on one line
 * inside NAME_BUDGET reference px. The weights are Lilita One's uppercase
 * advance, with a space much narrower than a letter — which is what stops
 * "UTTAR PRADESH" over-shrinking. Both names on a card take the smaller size
 * so the pair reads as one poster.
 */
const NAME_MAX = 150;
const NAME_MIN = 40;
const NAME_BUDGET = 640;
const LETTER_ADVANCE = 0.6;
const SPACE_ADVANCE = 0.3;
const STRIP_ICONS = [0, 1, 2, 3, 4, 5];

function nameSize(labels: string[]): number {
  const widest = Math.max(
    ...labels.map((label) =>
      [...label].reduce((w, ch) => w + (ch === ' ' ? SPACE_ADVANCE : LETTER_ADVANCE), 0),
    ),
  );
  return Math.max(NAME_MIN, Math.min(NAME_MAX, Math.floor(NAME_BUDGET / widest)));
}

function stateName(color: PropertyColor): string {
  return (theme.propertyNames[color] ?? color).toUpperCase();
}

/** Three seats: every one lit for a dual rent, only one for a wild rent. */
function Payers({ everyone }: { everyone: boolean }) {
  return (
    <div className="playing-card__rf-pay">
      <span className="playing-card__rf-heads" aria-hidden>
        {[true, everyone, everyone].map((on, i) => (
          <svg
            className={`playing-card__rf-head${on ? '' : ' playing-card__rf-head--off'}`}
            viewBox="0 0 40 44"
            focusable="false"
            key={i}
          >
            <circle cx="20" cy="12" r="9" fill="currentColor" />
            <path d="M3 43 C3 28 11 23 20 23 C29 23 37 28 37 43 Z" fill="currentColor" />
          </svg>
        ))}
      </span>
      <span className="playing-card__rf-pay-txt">
        {everyone ? 'ALL OPPONENTS PAY' : 'ONE OPPONENT PAYS'}
      </span>
    </div>
  );
}

function DualBlocks({ colors }: { colors: [PropertyColor, PropertyColor] }) {
  const size = nameSize(colors.map(stateName));
  return (
    <>
      {colors.map((color, i) => (
        <div
          className={`playing-card__rf-blk playing-card__rf-blk--${i}`}
          key={color}
          style={{ '--rf-c': INDIA_PROPERTY_THEME[color].base } as CSSProperties}
        >
          <span className="playing-card__rf-name" style={{ '--rf-name-size': size } as CSSProperties}>
            {stateName(color)}
          </span>
          <span className="playing-card__rf-strip" aria-hidden>
            {STRIP_ICONS.map((n) => (
              <PropertyLandmark key={n} color={color} className="playing-card__rf-ico" />
            ))}
          </span>
        </div>
      ))}
    </>
  );
}

export function RentFace({ card }: { card: RentCard }) {
  const [a, b] = card.colors;
  const dual = card.rentType === 'dual' && a && b;
  return (
    <div className="playing-card__rf" style={{ '--rf-rainbow': theme.rainbow('base') } as CSSProperties}>
      <div className="playing-card__rf-burst" aria-hidden />
      <span className="playing-card__rf-word">RENT</span>

      {dual ? (
        <DualBlocks colors={[a, b]} />
      ) : (
        <div className="playing-card__rf-wild">
          <span className="playing-card__rf-any">ANY</span>
          <span className="playing-card__rf-state">STATE</span>
        </div>
      )}

      <div className="playing-card__rf-foot">
        <Payers everyone={Boolean(dual)} />
      </div>

      <PriceBadge value={card.value} palette={RENT_BADGE} />
    </div>
  );
}
