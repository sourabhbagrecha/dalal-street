interface LocalHudProps {
  seatName: string;
  onNewGame: () => void;
}

/**
 * Local pass-and-play only: a small always-visible cluster on the board
 * itself so a player can tell which seat they're viewing without opening the
 * Table Feed drawer, plus a one-tap "New game" escape hatch that doesn't
 * require the drawer either. Fixed-position and deliberately unobtrusive —
 * verified in Playwright not to overlap the Table Feed FAB or END TURN.
 */
export function LocalHud({ seatName, onNewGame }: LocalHudProps) {
  return (
    <div className="local-hud">
      <span className="local-hud__seat" data-testid="local-seat-chip">
        You: {seatName}
      </span>
      <button
        type="button"
        className="local-hud__new-game"
        data-testid="local-hud-new-game"
        onClick={onNewGame}
      >
        New game
      </button>
    </div>
  );
}
