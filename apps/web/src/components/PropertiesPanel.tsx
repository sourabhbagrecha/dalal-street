import { useCallback } from 'react';
import type { ClientGameState, ClientPlayerSelf } from '@monopoly-deal/shared';
import { isDiscardExcessMode, readDraggedCardId } from '../legality';
import { completeSetCount } from '../derivations';
import { useGameStore } from '../store';
import { PropertySetView } from './PropertySetView';

interface PropertiesPanelProps {
  player: ClientPlayerSelf;
  clientState: ClientGameState;
  highlight: boolean;
  shake?: boolean;
}

export function PropertiesPanel({ player, clientState, highlight, shake }: PropertiesPanelProps) {
  const isCompleteSetFn = useGameStore((api) => api.isCompleteSet);
  const secured = completeSetCount(player, isCompleteSetFn);
  const playCard = useGameStore((api) => api.playCard);
  const rejectLocal = useGameStore((api) => api.rejectLocal);
  const getLegalPlayZones = useGameStore((api) => api.getLegalPlayZones);
  const pickPlayCommandFn = useGameStore((api) => api.pickPlayCommand);

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!highlight) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    [highlight],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const cardId = readDraggedCardId(e.dataTransfer);
      if (!cardId) return;

      if (isDiscardExcessMode(clientState, player.id)) {
        rejectLocal('Use discard pile to drop excess cards');
        return;
      }

      const zones = getLegalPlayZones(cardId);
      if (!zones.includes('property')) {
        rejectLocal('Cannot play this card as a property');
        return;
      }

      const cmd = pickPlayCommandFn(cardId, 'property');
      if (!cmd) {
        rejectLocal('Cannot play this card as a property');
        return;
      }
      playCard(cardId, 'property', cmd.target);
    },
    [clientState, player.id, playCard, rejectLocal, getLegalPlayZones, pickPlayCommandFn],
  );

  return (
    <section
      className={`properties-panel drop-zone${highlight ? ' drop-zone--active' : ''}${shake ? ' drop-zone--shake' : ''}`}
      aria-label="Your properties"
      data-testid="properties-drop"
      data-drop-zone="property"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <header className="panel-header">
        <h2 className="panel-header__title">YOUR PROPERTIES</h2>
        <span className="panel-header__badge">
          {secured} SET{secured === 1 ? '' : 'S'} HELD · 3 TO WIN
        </span>
      </header>

      <div className="properties-panel__content">
        {player.board.sets.length === 0 ? (
          <p className="properties-panel__empty">No property sets yet — drop properties here</p>
        ) : (
          player.board.sets.map((set) => <PropertySetView key={set.id} set={set} />)
        )}
      </div>
    </section>
  );
}
