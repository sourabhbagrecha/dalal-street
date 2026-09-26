import '../../styles/gl-chrome.css';

/** /demo dev drawer: deal a fresh table of N players (the `?players=N` query param, without a reload). */
export function DevDeal({ current, onDeal }: { current: number; onDeal(players: number): void }) {
  return (
    <div className="dev-controls__group cx-deal">
      <span className="dev-controls__label">New game · players</span>
      <div className="dev-controls__seats" role="group" aria-label="Player count">
        {[2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            data-players={n}
            className={`dev-controls__seat${n === current ? ' dev-controls__seat--active' : ''}`}
            onClick={() => onDeal(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
