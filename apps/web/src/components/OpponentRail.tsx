import { useCallback, useState } from 'react';
import type { ClientGameState } from '@monopoly-deal/shared';
import { opponentsOfClient } from '../derivations';
import { OpponentCard } from './OpponentCard';
import { OpponentInspectModal } from './OpponentInspectModal';

interface OpponentRailProps {
  clientState: ClientGameState;
  showConnection?: boolean;
}

export function OpponentRail({ clientState, showConnection }: OpponentRailProps) {
  const opponents = opponentsOfClient(clientState);
  const [inspectedId, setInspectedId] = useState<string | null>(null);

  const handleInspect = useCallback((playerId: string) => {
    setInspectedId(playerId);
  }, []);

  const handleClose = useCallback(() => setInspectedId(null), []);

  const inspectedPlayer = inspectedId ? opponents.find((p) => p.id === inspectedId) ?? null : null;

  return (
    <>
      <section className="opponent-rail" aria-label="Opponents">
        {opponents.map((player) => (
          <OpponentCard
            key={player.id}
            player={player}
            clientState={clientState}
            showConnection={showConnection}
            onInspect={handleInspect}
            isSelected={inspectedId === player.id}
          />
        ))}
      </section>
      {inspectedPlayer && (
        <OpponentInspectModal
          player={inspectedPlayer}
          clientState={clientState}
          initialTab="properties"
          onClose={handleClose}
        />
      )}
    </>
  );
}
