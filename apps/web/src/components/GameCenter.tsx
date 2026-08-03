import type { GameState } from '@monopoly-deal/shared';
import { HAND_LIMIT, MAX_PLAYS } from '@monopoly-deal/shared';
import { turnLabel } from '../derivations';
import { theme } from '../theme';
import { PlayingCard } from './PlayingCard';

interface GameCenterProps {
  state: GameState;
  localPlayerId: string;
}

export function GameCenter({ state, localPlayerId }: GameCenterProps) {
  const localStatus = turnLabel(state, localPlayerId);
  const current = state.players[state.currentPlayerIndex];
  const currentName =
    current?.id === localPlayerId
      ? 'You'
      : theme.seatName(state.currentPlayerIndex, false);

  const topDiscard = state.discard[state.discard.length - 1];
  const localPlayer = state.players.find((p) => p.id === localPlayerId);
  const handCount = localPlayer?.hand.length ?? 0;
  const overHandLimit = handCount > HAND_LIMIT;

  return (
    <section className="game-center" aria-label="Table center">
      <div className="game-center__pile game-center__pile--draw">
        <div className="pile-stack pile-stack--draw">
          <span className="pile-stack__back" />
        </div>
        <span className="game-center__pile-label">DRAW · {state.deck.length}</span>
      </div>

      <div className="game-center__status">
        <div className="game-center__turn-banner">
          {localStatus === 'YOUR TURN' ? (
            <span className="game-center__your-turn">YOUR TURN</span>
          ) : (
            <span className="game-center__turn-text">
              {currentName}&apos;s turn
            </span>
          )}
        </div>

        <div className="game-center__indicators">
          <span
            className={`game-indicator${state.drawnThisTurn ? ' game-indicator--active' : ''}`}
          >
            DRAW 2
          </span>
          <span className="game-indicator game-indicator--active">
            CARD PLAYS
          </span>
          <span
            className={`game-indicator${overHandLimit ? ' game-indicator--warn' : ' game-indicator--active'}`}
          >
            HAND ≤ {HAND_LIMIT}
          </span>
        </div>

        <div className="game-center__plays" aria-label={`${state.playsRemaining} plays remaining`}>
          {Array.from({ length: MAX_PLAYS }, (_, i) => (
            <span
              key={i}
              className={`play-dot${i < state.playsRemaining ? ' play-dot--remaining' : ' play-dot--used'}`}
            />
          ))}
          <span className="game-center__plays-text">
            {state.playsRemaining} of {MAX_PLAYS}
          </span>
        </div>

        <div className="game-center__timer" aria-hidden>
          <span className="game-center__timer-ring" />
        </div>
      </div>

      <div className="game-center__pile game-center__pile--discard">
        {topDiscard ? (
          <PlayingCard card={topDiscard} size="sm" />
        ) : (
          <div className="pile-stack pile-stack--empty">
            <span className="pile-stack__empty-label">Discard</span>
          </div>
        )}
        <span className="game-center__pile-label">DISCARD · {state.discard.length}</span>
      </div>
    </section>
  );
}
