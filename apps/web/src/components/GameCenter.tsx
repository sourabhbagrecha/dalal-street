import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import type { Card, ClientGameState, PlayTarget } from '@monopoly-deal/shared';
import { HAND_LIMIT, MAX_PLAYS } from '@monopoly-deal/shared';
import { isDiscardExcessMode, readDraggedCardId } from '../legality';
import { playerDisplayName, turnLabelClient, allPlayers } from '../derivations';
import { formatCountdown, useCountdown } from '../hooks/useCountdown';
import { useCurrency } from '../hooks/useCurrency';
import { useGameStore } from '../store';
import type { WastedPlayReason } from '../store/types';
import { WastedPlayPrompt } from './GamePrompts';
import { PlayingCard } from './PlayingCard';

/** A discard-pile play held back until the player confirms it is really what they want. */
interface HeldWastedPlay {
  card: Card;
  target?: PlayTarget;
  reason: WastedPlayReason;
}

interface GameCenterProps {
  clientState: ClientGameState;
  discardHighlight: boolean;
  discardDim?: boolean;
  discardShake?: boolean;
  onDiscardCard?: (cardId: string) => void;
}

export function GameCenter({
  clientState,
  discardHighlight,
  discardDim,
  discardShake,
  onDiscardCard,
}: GameCenterProps) {
  const { currency } = useCurrency();
  const draw = useGameStore((api) => api.draw);
  const playCard = useGameStore((api) => api.playCard);
  const rejectLocal = useGameStore((api) => api.rejectLocal);
  const canDrawFn = useGameStore((api) => api.canDraw);
  const pickPlayCommandFn = useGameStore((api) => api.pickPlayCommand);
  const wastedDiscardPlayFn = useGameStore((api) => api.wastedDiscardPlay);
  const endTurn = useGameStore((api) => api.endTurn);
  const canEndTurnFn = useGameStore((api) => api.canEndTurn);

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
  const endTurnEnabled = canEndTurnFn();

  const turnRemaining = useCountdown(clientState.deadlines?.turnMs);
  const pendingRemaining = useCountdown(clientState.deadlines?.pendingMs);
  const timerMs = pendingRemaining ?? turnRemaining;
  const currentSeat = allPlayers(clientState).findIndex(
    (p) => p.id === clientState.currentPlayerId,
  );

  const [heldWastedPlay, setHeldWastedPlay] = useState<HeldWastedPlay | null>(null);

  // A card can leave the hand while the confirmation sits open — an interrupt
  // resolving, the turn clock expiring, a pass-and-play seat switch. Drop the
  // held play rather than letting "Yes" fire a command for a card that is gone.
  useEffect(() => {
    if (!heldWastedPlay) return;
    const stillHoldable =
      clientState.currentPlayerId === viewerId &&
      clientState.you.hand.some((c) => c.id === heldWastedPlay.card.id);
    if (!stillHoldable) setHeldWastedPlay(null);
  }, [heldWastedPlay, clientState.currentPlayerId, clientState.you.hand, viewerId]);

  const onDraw = () => {
    if (drawEnabled) draw();
  };

  const onEndTurn = () => {
    endTurn();
  };

  // Draw automatically as soon as it becomes the viewer's turn — no explicit click needed.
  const autoDrawKey = useRef<string | null>(null);
  useEffect(() => {
    if (!drawEnabled) return;
    const key = `${clientState.currentPlayerId}:${clientState.turnNumber}`;
    if (autoDrawKey.current === key) return;
    autoDrawKey.current = key;
    draw();
  }, [drawEnabled, clientState.currentPlayerId, clientState.turnNumber, draw]);

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

    // The rules allow plays that do nothing at all (a rent card for colours you
    // own none of, a Deal Breaker with no set to break). Rather than silently
    // burning the card and one of three plays, hold the play and ask first.
    const reason = wastedDiscardPlayFn(cardId);
    const card = clientState.you.hand.find((c) => c.id === cardId);
    if (reason && card) {
      setHeldWastedPlay({ card, target: cmd.target, reason });
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
          aria-label={`Draw pile, ${clientState.deckCount} cards`}
          onClick={onDraw}
        >
          {/* `--pile-glyph` drives the draw-pile badge glyph — see the styles.css
              edit noted in this task's report; currently styles.css hardcodes
              `content: "$"` regardless of currency, so this variable has no
              effect until that CSS lands. */}
          <span
            className="pile-stack__back"
            style={{ '--pile-glyph': `"${currency.symbol}"` } as CSSProperties}
          />
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
            <button
              type="button"
              className="end-turn-btn"
              data-testid="end-turn-btn"
              disabled={!endTurnEnabled}
              onClick={onEndTurn}
            >
              END TURN
            </button>
          ) : (
            <span className="game-center__turn-text">{currentName}&apos;s turn</span>
          )}
        </div>

        <div
          className="game-center__indicators"
          aria-label={`Draw two: ${clientState.drawnThisTurn ? 'done' : 'not yet'}. Card plays available. Hand limit ${HAND_LIMIT} cards${overHandLimit ? ', currently over' : ''}.`}
        >
          <span
            aria-hidden="true"
            className={`game-indicator${clientState.drawnThisTurn ? ' game-indicator--active' : ''}`}
          >
            DRAW 2
          </span>
          <span aria-hidden="true" className="game-indicator game-indicator--active">
            CARD PLAYS
          </span>
          <span
            aria-hidden="true"
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
          <span className="game-center__plays-suffix">
            {clientState.playsRemaining === 1 ? 'play left' : 'plays left'}
          </span>
        </div>

        {/* Absolutely positioned against .game-center on a wide board, so it sits
            in the table's top-left corner regardless of living here in the DOM.
            It is a child of the status stack so that the phone layout can drop it
            into the same row as the plays pill instead of stealing a band of the
            centre's height for a chip that is 20px tall. Omitted entirely rather
            than rendered as a placeholder when there is no deadline to show — local
            pass-and-play never populates `clientState.deadlines`, and a bare "—"
            sitting next to END TURN forever reads as a broken clock, not "no timer". */}
        {timerMs !== null && (
          <div className="game-center__timer" aria-hidden>
            <span className="game-center__timer-ring" />
            <span className="game-center__timer-text">{formatCountdown(timerMs)}</span>
          </div>
        )}
      </div>

      <div
        className={`game-center__pile game-center__pile--discard drop-zone${discardHighlight ? ' drop-zone--active' : ''}${discardDim ? ' drop-zone--dim' : ''}${discardShake ? ' drop-zone--shake' : ''}`}
        data-testid="discard-drop"
        data-drop-zone="discard"
        onDragOver={onDiscardDragOver}
        onDrop={onDiscardDrop}
      >
        {discardHighlight && (
          <span className="drop-zone__label" aria-hidden data-testid="discard-drop-label">
            {isDiscardExcessMode(clientState, viewerId) ? 'Discard' : 'Play'}
          </span>
        )}
        {topDiscard ? (
          <PlayingCard card={topDiscard} />
        ) : (
          <div className="pile-stack pile-stack--empty">
            <span className="pile-stack__empty-label">Discard</span>
          </div>
        )}
        <span className="game-center__pile-label">DISCARD · {clientState.discardCount}</span>
      </div>

      {heldWastedPlay && (
        <WastedPlayPrompt
          card={heldWastedPlay.card}
          reason={heldWastedPlay.reason}
          onCancel={() => setHeldWastedPlay(null)}
          onConfirm={() => {
            playCard(heldWastedPlay.card.id, 'discard', heldWastedPlay.target);
            setHeldWastedPlay(null);
          }}
        />
      )}
    </section>
  );
}
