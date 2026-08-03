import { theme } from '../theme';
import { useGameStore } from '../store';

export function WinOverlay() {
  const state = useGameStore((s) => s.state);
  const startNewGame = useGameStore((s) => s.startNewGame);

  if (!state.winnerId) return null;

  const winnerIndex = state.players.findIndex((p) => p.id === state.winnerId);
  const winnerName =
    winnerIndex >= 0 ? theme.seatName(winnerIndex, false) : state.winnerId;

  return (
    <div className="win-overlay" data-testid="win-overlay" role="dialog" aria-label="Game over">
      <div className="win-overlay__card">
        <h2 className="win-overlay__title">Winner!</h2>
        <p className="win-overlay__winner">{winnerName} wins the game</p>
        <button
          type="button"
          className="prompt-btn prompt-btn--primary"
          data-testid="restart-btn"
          onClick={() => startNewGame(4, Date.now() % 1_000_000)}
        >
          Play again
        </button>
      </div>
    </div>
  );
}
