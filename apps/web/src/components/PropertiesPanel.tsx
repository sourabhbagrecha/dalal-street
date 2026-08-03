import type { PlayerState } from '@monopoly-deal/shared';
import { completeSetCount } from '../derivations';
import { PropertySetView } from './PropertySetView';

interface PropertiesPanelProps {
  player: PlayerState;
}

export function PropertiesPanel({ player }: PropertiesPanelProps) {
  const secured = completeSetCount(player);

  return (
    <section className="properties-panel" aria-label="Your properties">
      <header className="panel-header">
        <h2 className="panel-header__title">YOUR PROPERTIES</h2>
        <span className="panel-header__badge">{secured} secured</span>
      </header>

      <div className="properties-panel__content">
        {player.board.sets.length === 0 ? (
          <p className="properties-panel__empty">No property sets yet</p>
        ) : (
          player.board.sets.map((set) => (
            <PropertySetView key={set.id} set={set} />
          ))
        )}
      </div>
    </section>
  );
}
