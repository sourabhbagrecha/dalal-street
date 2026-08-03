import type { PropertySet } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import { isCompleteSet, rentForSet } from '@monopoly-deal/engine';
import { setProgress } from '../derivations';
import { theme } from '../theme';
import { PlayingCard } from './PlayingCard';

interface PropertySetViewProps {
  set: PropertySet;
}

export function PropertySetView({ set }: PropertySetViewProps) {
  const color = theme.propertyColors[set.color] ?? '#888';
  const name = theme.propertyNames[set.color] ?? set.color;
  const complete = isCompleteSet(set);
  const rent = rentForSet(set);

  return (
    <div className="property-set-view">
      <div
        className="property-set-view__header"
        style={{ background: color }}
      >
        <span className="property-set-view__name">{name}</span>
        <span className="property-set-view__progress">{setProgress(set)}</span>
      </div>

      <div className="property-set-view__body">
        <div className="property-set-view__cards">
          {set.cards.map((card) => (
            <PlayingCard key={card.id} card={card} size="sm" />
          ))}
          {set.house && <PlayingCard card={set.house} size="sm" />}
          {set.hotel && <PlayingCard card={set.hotel} size="sm" />}
        </div>

        <div className="property-set-view__footer">
          {complete ? (
            <span className="property-set-view__secured">SET SECURED</span>
          ) : (
            <span className="property-set-view__needed">
              Need {SET_SIZES[set.color] - set.cards.length} more
            </span>
          )}
          {rent > 0 && (
            <span className="property-set-view__rent">
              Rent {theme.formatMoney(rent)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
