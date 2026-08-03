import { useCallback } from 'react';
import type { PlayerState } from '@monopoly-deal/shared';
import {
  isDiscardExcessMode,
  legalPlayCommands,
  pickPlayCommand,
  readDraggedCardId,
} from '../legality';
import { completeSetCount } from '../derivations';
import { useGameStore } from '../store';
import { PropertySetView } from './PropertySetView';

interface PropertiesPanelProps {
  player: PlayerState;
  highlight: boolean;
  shake?: boolean;
}

export function PropertiesPanel({ player, highlight, shake }: PropertiesPanelProps) {
  const secured = completeSetCount(player);
  const state = useGameStore((s) => s.state);
  const playCard = useGameStore((s) => s.playCard);
  const rejectLocal = useGameStore((s) => s.rejectLocal);

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

      if (isDiscardExcessMode(state, player.id)) {
        rejectLocal('Use discard pile to drop excess cards');
        return;
      }

      const cmds = legalPlayCommands(state, player.id, cardId).filter((c) => c.zone === 'property');
      if (cmds.length === 0) {
        rejectLocal('Cannot play this card as a property');
        return;
      }

      const cmd = cmds.length === 1 ? cmds[0]! : pickPlayCommand(state, player.id, cardId, 'property');
      if (!cmd) {
        rejectLocal('Cannot play this card as a property');
        return;
      }
      playCard(cardId, 'property', cmd.target);
    },
    [state, player.id, playCard, rejectLocal],
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
          player.board.sets.map((set) => (
            <PropertySetView key={set.id} set={set} />
          ))
        )}
      </div>
    </section>
  );
}
