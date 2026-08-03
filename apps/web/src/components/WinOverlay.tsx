import type { ClientGameState } from '@monopoly-deal/shared';
import { playerDisplayName } from '../derivations';
import { useGameStore } from '../store';

interface WinOverlayProps {
  clientState: ClientGameState;
  onRestart?: () => void;
}

export function WinOverlay({ clientState, onRestart }: WinOverlayProps) {
  const startNewGame = useGameStore((api) => api.startNewGame);

  if (!clientState.winnerId) return null;

  const winner =
    clientState.winnerId === clientState.viewerId
      ? clientState.you
      : clientState.players.find((p) => p.id === clientState.winnerId);
  const winnerIndex = winner
    ? clientState.players.findIndex((p) => p.id === winner.id)
    : -1;
  const winnerName = winner
    ? playerDisplayName(clientState, winner, winnerIndex >= 0 ? winnerIndex : 0)
    : clientState.winnerId;

  const handleRestart = () => {
    if (onRestart) onRestart();
    else startNewGame?.(4, Date.now() % 1_000_000);
  };

  return (
    <div className="win-overlay" data-testid="win-overlay" role="dialog" aria-label="Game over">
      <div className="win-overlay__card">
        <h2 className="win-overlay__title">Winner!</h2>
        <p className="win-overlay__winner">{winnerName} wins the game</p>
        {onRestart && (
          <button
            type="button"
            className="prompt-btn prompt-btn--primary"
            data-testid="restart-btn"
            onClick={handleRestart}
          >
            Play again
          </button>
        )}
      </div>
    </div>
  );
}
