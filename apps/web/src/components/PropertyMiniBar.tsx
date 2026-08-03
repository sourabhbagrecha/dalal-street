import type { PropertySet } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import { isCompleteSet } from '@monopoly-deal/engine';
import { theme } from '../theme';

interface PropertyMiniBarProps {
  set: PropertySet;
}

export function PropertyMiniBar({ set }: PropertyMiniBarProps) {
  const needed = SET_SIZES[set.color];
  const complete = isCompleteSet(set);
  const color = theme.propertyColors[set.color] ?? '#888';
  const label = theme.propertyNames[set.color] ?? set.color;

  return (
    <div
      className={`property-mini-bar${complete ? ' property-mini-bar--complete' : ''}`}
      title={`${label} ${set.cards.length}/${needed}`}
    >
      <div className="property-mini-bar__track">
        {Array.from({ length: needed }, (_, i) => (
          <span
            key={i}
            className={`property-mini-bar__segment${i < set.cards.length ? ' property-mini-bar__segment--filled' : ''}`}
            style={{ background: i < set.cards.length ? color : undefined }}
          />
        ))}
      </div>
      <div className="property-mini-bar__label">{label}</div>
      <div
        className={`property-mini-bar__count${complete ? ' property-mini-bar__count--complete' : ''}`}
      >
        {set.cards.length}/{needed}
      </div>
      {set.house && <span className="property-mini-bar__badge property-mini-bar__badge--house">H</span>}
      {set.hotel && <span className="property-mini-bar__badge property-mini-bar__badge--hotel">★</span>}
    </div>
  );
}
