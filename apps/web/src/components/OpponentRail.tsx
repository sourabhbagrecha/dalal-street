import type { GameState } from '@monopoly-deal/shared';
import { opponentsOf } from '../derivations';
import { OpponentCard } from './OpponentCard';

interface OpponentRailProps {
  state: GameState;
  localPlayerId: string;
}

export function OpponentRail({ state, localPlayerId }: OpponentRailProps) {
  const opponents = opponentsOf(state, localPlayerId);

  return (
    <section className="opponent-rail" aria-label="Opponents">
      {opponents.map((player) => {
        const seatIndex = state.players.findIndex((p) => p.id === player.id);
        return (
          <OpponentCard
            key={player.id}
            player={player}
            seatIndex={seatIndex}
            state={state}
          />
        );
      })}
    </section>
  );
}
