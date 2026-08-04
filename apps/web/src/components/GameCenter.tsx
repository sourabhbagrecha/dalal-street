import type { DragEvent } from 'react';
import type { ClientGameState } from '@monopoly-deal/shared';
import { HAND_LIMIT, MAX_PLAYS } from '@monopoly-deal/shared';
import { isDiscardExcessMode, readDraggedCardId } from '../legality';
import { playerDisplayName, turnLabelClient, allPlayers } from '../derivations';
import { formatCountdown, useCountdown } from '../hooks/useCountdown';
import { useGameStore } from '../store';
import { PlayingCard } from './PlayingCard';

interface GameCenterProps {
  clientState: ClientGameState;
  discardHighlight: boolean;
  discardShake?: boolean;
  onDiscardCard?: (cardId: string) => void;
}

export function GameCenter({
  clientState,
  discardHighlight,
  discardShake,
  onDiscardCard,
}: GameCenterProps) {
  const draw = useGameStore((api) => api.draw);
  const playCard = useGameStore((api) => api.playCard);
  const rejectLocal = useGameStore((api) => api.rejectLocal);
  const canDrawFn = useGameStore((api) => api.canDraw);
  const pickPlayCommandFn = useGameStore((api) => api.pickPlayCommand);

  const viewerId = clientState.viewerId;
  const localStatus = turnLabelClient(clientState, viewerId);
  const currentPlayer =
    clientState.currentPlayerId === viewerId
      ? clientState.you
      : clientState.players.find((p) => p.id === clientState.currentPlayerId);
  const currentName =
    clientState.currentPlayerId === viewerId
      ? 'You'
      : currentPlayer
        ? playerDisplayName(
            clientState,
            currentPlayer,
            clientState.players.findIndex((p) => p.id === currentPlayer.id),
          )
        : 'Player';

  const topDiscard = clientState.discardTop;
  const handCount = clientState.you.hand.length;
  const overHandLimit = handCount > HAND_LIMIT;
  const drawEnabled = canDrawFn();

  const turnRemaining = useCountdown(clientState.deadlines?.turnMs);
  const pendingRemaining = useCountdown(clientState.deadlines?.pendingMs);
  const timerMs = pendingRemaining ?? turnRemaining;
  const currentSeat = allPlayers(clientState).findIndex(
    (p) => p.id === clientState.currentPlayerId,
  );

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
    const cardId = readDraggedCardId(e.dataTransfer);
    if (!cardId) return;

    if (isDiscardExcessMode(clientState, viewerId)) {
      onDiscardCard?.(cardId);
      return;
    }

    const cmd = pickPlayCommandFn(cardId, 'discard');
    if (!cmd) {
      rejectLocal('Cannot discard this card here');
      return;
    }
    playCard(cardId, 'discard', cmd.target);
  };

  return (
    <section className="game-center" aria-label="Table center">
      <div className="game-center__timer" aria-hidden>
        <span className="game-center__timer-ring" />
        <span className="game-center__timer-text">{formatCountdown(timerMs)}</span>
      </div>

      <div className="game-center__pile game-center__pile--draw">
        <button
          type="button"
          className={`pile-stack pile-stack--draw${drawEnabled ? ' pile-stack--clickable' : ''}`}
          data-testid="draw-pile"
          aria-label={`Draw pile, ${clientState.deckCount} cards`}
          disabled={!drawEnabled}
          onClick={onDraw}
        >
          <span className="pile-stack__back" />
        </button>
        <span className="game-center__pile-label">DRAW · {clientState.deckCount}</span>
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
          data-current-seat={currentSeat >= 0 ? currentSeat : undefined}
        >
          {localStatus === 'YOUR TURN' ? (
            <span className="game-center__your-turn">YOUR TURN</span>
          ) : (
            <span className="game-center__turn-text">{currentName}&apos;s turn</span>
          )}
        </div>

        <div className="game-center__indicators" aria-hidden>
          <span
            className={`game-indicator${clientState.drawnThisTurn ? ' game-indicator--active' : ''}`}
          >
            DRAW 2
          </span>
          <span className="game-indicator game-indicator--active">CARD PLAYS</span>
          <span
            className={`game-indicator${overHandLimit ? ' game-indicator--warn' : ' game-indicator--active'}`}
          >
            HAND ≤ {HAND_LIMIT}
          </span>
        </div>

        <div
          className="game-center__plays"
          aria-label={`${clientState.playsRemaining} plays remaining`}
        >
          <span className="game-center__plays-label">Plays left</span>
          {Array.from({ length: MAX_PLAYS }, (_, i) => (
            <span
              key={i}
              className={`play-dot${i < clientState.playsRemaining ? ' play-dot--remaining' : ' play-dot--used'}`}
            />
          ))}
          <span className="game-center__plays-text">
            {clientState.playsRemaining} of {MAX_PLAYS}
          </span>
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
          <PlayingCard card={topDiscard} size="md" />
        ) : (
          <div className="pile-stack pile-stack--empty">
            <span className="pile-stack__empty-label">Discard</span>
          </div>
        )}
        <span className="game-center__pile-label">DISCARD · {clientState.discardCount}</span>
      </div>
    </section>
  );
}
