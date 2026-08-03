import { FIXTURE_NAMES, fixtureLabel, type FixtureName } from '../fixtureNames';
import { theme } from '../theme';

interface DevControlsProps {
  fixtureName: FixtureName;
  onFixtureChange: (name: FixtureName) => void;
  localSeatIndex: number;
  onSeatChange: (index: number) => void;
  playerCount: number;
}

export function DevControls({
  fixtureName,
  onFixtureChange,
  localSeatIndex,
  onSeatChange,
  playerCount,
}: DevControlsProps) {
  return (
    <div className="dev-controls">
      <label className="dev-controls__group">
        <span className="dev-controls__label">Scenario</span>
        <select
          className="dev-controls__select"
          aria-label="Dev scenario"
          value={fixtureName}
          onChange={(e) => onFixtureChange(e.target.value as FixtureName)}
        >
          {FIXTURE_NAMES.map((name) => (
            <option key={name} value={name}>
              {fixtureLabel(name)}
            </option>
          ))}
        </select>
      </label>

      <div className="dev-controls__group">
        <span className="dev-controls__label">Your seat</span>
        <div className="dev-controls__seats" role="group" aria-label="Seat switcher">
          {Array.from({ length: playerCount }, (_, i) => (
            <button
              key={i}
              type="button"
              data-seat={i}
              className={`dev-controls__seat${i === localSeatIndex ? ' dev-controls__seat--active' : ''}`}
              onClick={() => onSeatChange(i)}
              title={`Seat ${i + 1} (${theme.seatName(i, i === localSeatIndex)})`}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <span className="dev-controls__hint">Keys 1–{playerCount}</span>
      </div>
    </div>
  );
}

export { FIXTURE_NAMES };
