import type { ClientGameState } from '@monopoly-deal/shared';
import { opponentsOfClient } from '../derivations';
import { OpponentCard } from './OpponentCard';

interface OpponentRailProps {
  clientState: ClientGameState;
  showConnection?: boolean;
}

export function OpponentRail({ clientState, showConnection }: OpponentRailProps) {
  const opponents = opponentsOfClient(clientState);

  return (
    <section className="opponent-rail" aria-label="Opponents">
      {opponents.map((player, index) => (
        <OpponentCard
          key={player.id}
          player={player}
          clientState={clientState}
          seatIndex={index + 1}
          showConnection={showConnection}
        />
      ))}
    </section>
  );
}
