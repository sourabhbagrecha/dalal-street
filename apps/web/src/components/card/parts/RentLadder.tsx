import { theme } from '../../../theme';
import { PropertyStarIcon } from '../../PropertyLandmarks';
import { MiniCardRow } from './MiniCardRow';

interface RentLadderProps {
  /** Rent by card count, index = count - 1 (RENT_TABLE[color]). */
  rents: number[];
  /** Caption printed under the full-set row's label, if any. */
  fullSetCaption?: string;
  /**
   * Cards the owning set holds now; that row is the one lit gold. Omitted
   * (hand, gallery, prompts) it defaults to the full set.
   */
  currentCount?: number;
}

/** Index of the row to light: the tier `count` cards earn, clamped to the ladder. */
export function currentRentIndex(rentsLength: number, count: number | undefined): number {
  return Math.max(0, Math.min(count ?? rentsLength, rentsLength)) - 1;
}

/**
 * The property card's stacked rent rows: one row per card count (mini-card
 * icons, "N CARDS", the ₹ rent), the last one starred for the full set,
 * and the row the set currently earns lit gold. Rows are the one region whose content amount varies per state, so
 * they scale on `--card-scale-rows` (see `--card-ref-rows` in cards.css),
 * not the flat `--card-scale` the rest of the face uses.
 *
 * Class names double as the selectors verification/e2e/card-aspect-ratio
 * .spec.ts (append-only) pads and measures — keep them stable.
 */
export function RentLadder({ rents, fullSetCaption, currentCount }: RentLadderProps) {
  const currentIdx = currentRentIndex(rents.length, currentCount);
  return (
    <div className="playing-card__pcard-rows">
      {rents.map((amount, idx) => {
        const count = idx + 1;
        const isFullSet = idx === rents.length - 1;
        const isCurrent = idx === currentIdx;
        return (
          <div
            key={count}
            className={`playing-card__pcard-row${isFullSet ? ' playing-card__pcard-row--full' : ''}${isCurrent ? ' playing-card__pcard-row--current' : ''}`}
            aria-current={isCurrent || undefined}
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
