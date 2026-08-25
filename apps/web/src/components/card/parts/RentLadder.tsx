import { theme } from '../../../theme';
import { PropertyStarIcon } from '../../PropertyLandmarks';
import { MiniCardRow } from './MiniCardRow';

interface RentLadderProps {
  /** Rent by card count, index = count - 1 (RENT_TABLE[color]). */
  rents: number[];
  /** Caption printed under the full-set row's label, if any. */
  fullSetCaption?: string;
}

/**
 * The property card's stacked rent rows: one row per card count (mini-card
 * icons, "N CARDS", the ₹ rent), the last one gold with a star for the full
 * set. Rows are the one region whose content amount varies per state, so
 * they scale on `--card-scale-rows` (see `--card-ref-rows` in cards.css),
 * not the flat `--card-scale` the rest of the face uses.
 *
 * Class names double as the selectors verification/e2e/card-aspect-ratio
 * .spec.ts (append-only) pads and measures — keep them stable.
 */
export function RentLadder({ rents, fullSetCaption }: RentLadderProps) {
  return (
    <div className="playing-card__pcard-rows">
      {rents.map((amount, idx) => {
        const count = idx + 1;
        const isFullSet = idx === rents.length - 1;
        return (
          <div
            key={count}
            className={`playing-card__pcard-row${isFullSet ? ' playing-card__pcard-row--full' : ''}`}
          >
            {isFullSet ? (
              <PropertyStarIcon className="playing-card__pcard-row-icon" />
            ) : (
              <MiniCardRow count={count} />
            )}
            <span className="playing-card__pcard-row-label">
              {isFullSet ? `FULL SET · ${count} CARD${count > 1 ? 'S' : ''}` : `${count} CARD${count > 1 ? 'S' : ''}`}
              {isFullSet && fullSetCaption && (
                <>
                  <br />
                  <span className="playing-card__pcard-row-caption">{fullSetCaption}</span>
                </>
              )}
            </span>
            <span className="playing-card__pcard-row-price">
              {theme.currencySymbol}
              {amount}
            </span>
          </div>
        );
      })}
    </div>
  );
}
