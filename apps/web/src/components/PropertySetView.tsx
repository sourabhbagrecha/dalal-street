import type { PropertySet } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import { isSetCompleteBySize, setProgress } from '../derivations';
import { theme } from '../theme';
import { PlayingCard } from './PlayingCard';

interface PropertySetViewProps {
  set: PropertySet;
}

export function PropertySetView({ set }: PropertySetViewProps) {
  const name = theme.propertyNames[set.color] ?? set.color;
  const complete = isSetCompleteBySize(set);
  const needed = SET_SIZES[set.color];

  return (
    <div className={`property-set-view${complete ? ' property-set-view--complete' : ''}`}>
      {complete && <div className="property-set-view__secured-banner">SET SECURED</div>}

      <div className="property-set-view__body">
        <div className="property-set-view__cards">
          {set.cards.map((card, i) => (
            <PlayingCard
              key={card.id}
              card={card}
              size="board"
              className="property-set-view__card"
              style={{ zIndex: i + 1 }}
            />
          ))}
          {set.house && (
            <PlayingCard
              card={set.house}
              size="board"
              className="property-set-view__card"
              style={{ zIndex: set.cards.length + 1 }}
            />
          )}
          {set.hotel && (
            <PlayingCard
              card={set.hotel}
              size="board"
              className="property-set-view__card"
              style={{ zIndex: set.cards.length + 2 }}
            />
          )}
        </div>

        <div className="property-set-view__footer">
          <span className="property-set-view__needed">
            {complete
              ? `${name.toUpperCase()} • FULL SET`
              : name.toUpperCase()}
          </span>
          <span
            className={`property-set-view__progress${complete ? ' property-set-view__progress--full' : ''}`}
            aria-label={`${set.cards.length} of ${needed}`}
          >
            {setProgress(set)}
          </span>
        </div>
      </div>
    </div>
  );
}
