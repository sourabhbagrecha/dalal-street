import { useEffect, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Card, ClientGameState, PlayTarget } from '@monopoly-deal/shared';
import { HAND_LIMIT, MAX_PLAYS } from '@monopoly-deal/shared';
import { isDiscardExcessMode, readDraggedCardId } from '../legality';
import { playerDisplayName, turnLabelClient, allPlayers } from '../derivations';
import { formatCountdown, useCountdown } from '../hooks/useCountdown';
import { useGameStore } from '../store';
import type { WastedPlayReason } from '../store/types';
import { RentDoublePrompt, WastedPlayPrompt } from './GamePrompts';
import { PlayingCard } from './PlayingCard';

/** A discard-pile play held back until the player confirms it is really what they want. */
interface HeldWastedPlay {
  card: Card;
  target?: PlayTarget;
  reason: WastedPlayReason;
}

/** A rent card dropped while a Double the Rent sits unplayed in hand — held so the player can chain it in first. */
interface HeldRentChoice {
  card: Card;
  doubleCard: Card;
  target?: PlayTarget;
}

interface GameCenterProps {
  clientState: ClientGameState;
  discardHighlight: boolean;
  discardDim?: boolean;
  discardShake?: boolean;
  onDiscardCard?: (cardId: string) => void;
  /** "stage": rendered inside the viewer's own seat on the table stage (OpponentSpotlight), without its own panel chrome. */
  variant?: 'panel' | 'stage';
}

export function GameCenter({
  clientState,
  discardHighlight,
  discardDim,
  discardShake,
  onDiscardCard,
  variant = 'panel',
}: GameCenterProps) {
  const draw = useGameStore((api) => api.draw);
  const playCard = useGameStore((api) => api.playCard);
  const dispatchCommand = useGameStore((api) => api.dispatchCommand);
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
  const timerPct = timerMs === null ? 0 : Math.max(0, Math.min(1, timerMs / 60_000));
  const currentSeat = allPlayers(clientState).findIndex(
    (p) => p.id === clientState.currentPlayerId,
  );

  const [heldWastedPlay, setHeldWastedPlay] = useState<HeldWastedPlay | null>(null);
  const [heldRent, setHeldRent] = useState<HeldRentChoice | null>(null);

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

  useEffect(() => {
    if (!heldRent) return;
    const stillHoldable =
      clientState.currentPlayerId === viewerId &&
      clientState.you.hand.some((c) => c.id === heldRent.card.id) &&
      clientState.you.hand.some((c) => c.id === heldRent.doubleCard.id);
    if (!stillHoldable) setHeldRent(null);
  }, [heldRent, clientState.currentPlayerId, clientState.you.hand, viewerId]);

  const onDraw = () => {
    if (drawEnabled) draw();
  };

  const onEndTurn = () => {
    endTurn();
  };

  // Auto-draw at the start of the viewer's turn lives in OpponentSpotlight (useAutoDraw), which is always mounted; this component only is while the viewer's seat is on stage.

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

    // A rent card with an unplayed Double the Rent still in hand — offer to
    // chain it in first, since doubling only applies to rent played after it.
    // Skip if doubling is already staged, or there isn't a second play left to spend.
    if (card?.kind === 'rent' && clientState.pendingDoubles === 0 && clientState.playsRemaining >= 2) {
      const doubleCard = clientState.you.hand.find(
        (c) => c.kind === 'action' && c.action === 'double_the_rent',
      );
      if (doubleCard) {
        setHeldRent({ card, doubleCard, target: cmd.target });
        return;
      }
    }

    playCard(cardId, 'discard', cmd.target);
  };

  const onConfirmRentPlain = () => {
    if (!heldRent) return;
    playCard(heldRent.card.id, 'discard', heldRent.target);
    setHeldRent(null);
  };

  const onConfirmRentDoubled = async () => {
    if (!heldRent) return;
    const { card, doubleCard, target } = heldRent;
    setHeldRent(null);
    const doubleCmd = pickPlayCommandFn(doubleCard.id, 'discard');
    const doubled = await dispatchCommand('PLAY_CARD', {
      cardId: doubleCard.id,
      zone: 'discard',
      target: doubleCmd?.target,
    });
    if (!doubled.ok) {
      rejectLocal(doubled.reason ?? 'Cannot play Double the Rent right now');
      return;
    }
    const rented = await dispatchCommand('PLAY_CARD', { cardId: card.id, zone: 'discard', target });
    if (!rented.ok) {
      rejectLocal(rented.reason ?? 'Cannot play this card here');
    }
  };

  return (
    <section className={variant === 'stage' ? 'game-center game-center--stage' : 'game-center'} aria-label="Table center">
      <div className="game-center__pile game-center__pile--draw">
        <button
          type="button"
          className={`pile-stack pile-stack--draw${drawEnabled ? ' pile-stack--clickable' : ''}`}
          data-testid="draw-pile"
          aria-label={`Draw pile, ${clientState.deckCount} cards`}
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

        {/* Absolutely positioned against .game-center on a wide board, so it sits
            in the table's top-left corner regardless of living here in the DOM.
            It is a child of the status stack so that the phone layout can drop it
            into the same row as the plays pill instead of stealing a band of the
            centre's height for a chip that is 20px tall. */}
        <div className="game-center__timer" aria-hidden>
          <span
            className="game-center__timer-ring"
            style={{ '--timer-pct': timerPct } as React.CSSProperties}
          />
          <span className="game-center__timer-text">{formatCountdown(timerMs)}</span>
        </div>
      </div>

      <div
        className={`game-center__pile game-center__pile--discard drop-zone${discardHighlight ? ' drop-zone--active' : ''}${discardDim ? ' drop-zone--dim' : ''}${discardShake ? ' drop-zone--shake' : ''}`}
        data-testid="discard-drop"
        data-drop-zone="discard"
        onDragOver={onDiscardDragOver}
        onDrop={onDiscardDrop}
      >
        {topDiscard ? (
          <PlayingCard card={topDiscard} />
        ) : (
          <div className="pile-stack pile-stack--empty">
            <span className="pile-stack__empty-label">Discard</span>
          </div>
        )}
        <span className="game-center__pile-label">DISCARD · {clientState.discardCount}</span>
      </div>

      {/* Portalled: this centre now lives inside the table stage, whose swap-in
          animation would otherwise make a fixed-position prompt jitter and
          whose prompt-dimming rule (.app:has(.game-prompt) .opponent-spotlight)
          would swallow the prompt's own clicks. */}
      {heldWastedPlay &&
        createPortal(
          <WastedPlayPrompt
            card={heldWastedPlay.card}
            reason={heldWastedPlay.reason}
            onCancel={() => setHeldWastedPlay(null)}
            onConfirm={() => {
              playCard(heldWastedPlay.card.id, 'discard', heldWastedPlay.target);
              setHeldWastedPlay(null);
            }}
          />,
          document.body,
        )}

      {heldRent &&
        createPortal(
          <RentDoublePrompt
            rentCard={heldRent.card}
            doubleCard={heldRent.doubleCard}
            onConfirmDouble={onConfirmRentDoubled}
            onConfirmPlain={onConfirmRentPlain}
            onCancel={() => setHeldRent(null)}
          />,
          document.body,
        )}
    </section>
  );
}
