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
  const [inspected, setInspected] = useState<{ id: string; tab: 'properties' | 'bank' } | null>(null);

  const handleInspect = useCallback((playerId: string, tab: 'properties' | 'bank') => {
    setInspected({ id: playerId, tab });
  }, []);

  const handleClose = useCallback(() => setInspected(null), []);

  const inspectedPlayer = inspected ? opponents.find((p) => p.id === inspected.id) ?? null : null;

  return (
    <>
      <section className="opponent-rail" aria-label="Opponents">
        {opponents.map((player, index) => (
          <OpponentCard
            key={player.id}
            player={player}
            clientState={clientState}
            seatIndex={index + 1}
            showConnection={showConnection}
            onInspect={handleInspect}
            isSelected={inspected?.id === player.id}
          />
        ))}
      </section>
      {inspectedPlayer && inspected && (
        <OpponentInspectModal
          player={inspectedPlayer}
          clientState={clientState}
          initialTab={inspected.tab}
          onClose={handleClose}
        />
      )}
    </>
  );
}
