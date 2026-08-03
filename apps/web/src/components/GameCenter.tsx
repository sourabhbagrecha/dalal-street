import type { DragEvent } from 'react';
import type { GameState } from '@monopoly-deal/shared';
import { HAND_LIMIT, MAX_PLAYS } from '@monopoly-deal/shared';
import { CARD_MIME, canDraw, isDiscardExcessMode, pickPlayCommand } from '../legality';
import { turnLabel } from '../derivations';
import { useGameStore } from '../store';
import { theme } from '../theme';
import { PlayingCard } from './PlayingCard';

interface GameCenterProps {
  state: GameState;
  localPlayerId: string;
  discardHighlight: boolean;
  discardShake?: boolean;
}

export function GameCenter({
  state,
  localPlayerId,
  discardHighlight,
  discardShake,
}: GameCenterProps) {
  const draw = useGameStore((s) => s.draw);
  const playCard = useGameStore((s) => s.playCard);
  const send = useGameStore((s) => s.send);
  const rejectLocal = useGameStore((s) => s.rejectLocal);

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
  const drawEnabled = canDraw(state, localPlayerId);

  const onDraw = () => {
    if (drawEnabled) draw();
  };

  const onDiscardDragOver = (e: DragEvent) => {
    if (!discardHighlight) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDiscardDrop = (e: DragEvent) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData(CARD_MIME);
    if (!cardId || !localPlayer) return;

    if (isDiscardExcessMode(state, localPlayer.id)) {
      const top = state.pendingStack[state.pendingStack.length - 1];
      if (top?.kind === 'hand_limit_discard') {
        send({ type: 'DISCARD_EXCESS', playerId: localPlayer.id, cardIds: [cardId] });
      }
      return;
    }

    const cmd = pickPlayCommand(state, localPlayer.id, cardId, 'discard');
    if (!cmd) {
      rejectLocal('Cannot discard this card here');
      return;
    }
    playCard(cardId, 'discard', cmd.target);
  };

  return (
    <section className="game-center" aria-label="Table center">
      <div className="game-center__pile game-center__pile--draw">
        <button
          type="button"
          className={`pile-stack pile-stack--draw${drawEnabled ? ' pile-stack--clickable' : ''}`}
          data-testid="draw-pile"
          aria-label={`Draw pile, ${state.deck.length} cards`}
          disabled={!drawEnabled}
          onClick={onDraw}
        >
          <span className="pile-stack__back" />
        </button>
        <span className="game-center__pile-label">DRAW · {state.deck.length}</span>
        {drawEnabled && (
          <button type="button" className="draw-btn" data-testid="draw-btn" onClick={onDraw}>
            Draw 2
          </button>
        )}
      </div>

      <div className="game-center__status">
        <div
          className="game-center__turn-banner"
          data-testid="turn-banner"
          data-current-seat={state.currentPlayerIndex}
        >
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

      <div
        className={`game-center__pile game-center__pile--discard drop-zone${discardHighlight ? ' drop-zone--active' : ''}${discardShake ? ' drop-zone--shake' : ''}`}
        data-testid="discard-drop"
        data-drop-zone="discard"
        onDragOver={onDiscardDragOver}
        onDrop={onDiscardDrop}
      >
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
