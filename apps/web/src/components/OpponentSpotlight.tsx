import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ClientGameState, ClientPlayerPublic } from '@monopoly-deal/shared';
import { MAX_PLAYS } from '@monopoly-deal/shared';
import { isSetCompleteBySize, nameFor, playerBankTotal, turnLabelClient } from '../derivations';
import { formatCountdown, useCountdown } from '../hooks/useCountdown';
import { useCurrency } from '../hooks/useCurrency';
import { useSwipe } from '../hooks/useSwipe';
import { useAttentionFor, useBankAttention } from '../moments/useAttention';
import { useGameStore } from '../store';
import { theme } from '../theme';
import { CashPile } from './CashPile';
import { GameCenter } from './GameCenter';
import { OpponentInspectModal } from './OpponentInspectModal';
import { PlayerAvatar } from './PlayerAvatar';
import { PropertySetView } from './PropertySetView';

interface OpponentSpotlightProps {
  clientState: ClientGameState;
  showConnection?: boolean;
  discardHighlight: boolean;
  discardDim?: boolean;
  discardShake?: boolean;
  onDiscardCard?: (cardId: string) => void;
}

/** Most bank chips a rim seat stacks — enough to read "rich" without a tower. */
const MAX_SEAT_CHIPS = 4;

/** A seat on the rim: an opponent's public board, or the viewer's own seat (which never shows a board — it's the panel below). */
interface Seat {
  player: ClientPlayerPublic;
  /** "You" for the viewer; their real name still drives the avatar initials. */
  name: string;
  avatarName: string;
  color: string;
  isSelf: boolean;
  /** Index among the viewer's opponents (colour + anchor order), -1 for the viewer. */
  opponentIndex: number;
}

interface SeatButtonProps {
  seat: Seat;
  /** Position along the rim, 0..1 left to right (CSS maps it into the rim's usable width). */
  t: number;
  isStaged: boolean;
  isActing: boolean;
  showConnection?: boolean;
  bankLabel: string;
  onTap: (playerId: string) => void;
}

/**
 * One seat on the far rim of the table: avatar, hand count, a stack of bank
 * chips and a dot per property set (gold once complete). The spinning dealer
 * button marks whose turn it is. Opponent seats keep the `opponent-peer-*`
 * test id: table-moment flights anchor on it (moments/anchors.ts) and the
 * e2e specs click it.
 */
function SeatButton({ seat, t, isStaged, isActing, showConnection, bankLabel, onTap }: SeatButtonProps) {
  const { player, name, avatarName, color, isSelf } = seat;
  const attention = useAttentionFor(player.id);
  const disconnected = Boolean(showConnection && !player.connected);
  // Seats sit on a circular arc: the further from the middle, the lower on the rim.
  const u = (t - 0.5) * 2;
  const y = 1 - Math.sqrt(Math.max(0, 1 - u * u));
  const className = `opponent-seat attn-host${isStaged ? ' opponent-seat--staged' : ''}${isActing ? ' opponent-seat--acting' : ''}${disconnected ? ' opponent-seat--disconnected' : ''}${isSelf ? ' opponent-seat--self' : ''}`;
  const chips = Math.min(MAX_SEAT_CHIPS, player.board.bank.length);

  return (
    <button
      type="button"
      className={className}
      style={{ '--seat': color, '--t': t, '--y': y } as CSSProperties}
      onClick={() => onTap(player.id)}
      aria-label={`${name}: ${player.handCount} in hand, bank ${bankLabel}${isActing ? ', their turn' : ''}${disconnected ? ', disconnected' : ''}`}
      aria-pressed={isStaged}
      data-testid={isSelf ? 'table-seat-self' : `opponent-peer-${player.id}`}
      data-attention={attention ?? undefined}
    >
      <span className="opponent-seat__stack" aria-hidden>
        {Array.from({ length: chips }, (_, k) => (
          <i key={k} style={{ '--k': k } as CSSProperties} />
        ))}
      </span>
      <PlayerAvatar name={avatarName} className="opponent-seat__avatar avatar" data-self={isSelf ? 'true' : undefined} />
      <span className="opponent-seat__hand">{player.handCount}</span>
      {isActing && (
        <span className="opponent-seat__dealer" aria-hidden>
          D
        </span>
      )}
      <span className="opponent-seat__dots" aria-hidden>
        {player.board.sets.map((set) => (
          <i key={set.id} className={isSetCompleteBySize(set) ? 'opponent-seat__dot--complete' : undefined} />
        ))}
      </span>
    </button>
  );
}

/** Plays-left dots + countdown ring for the seat whose turn it is. The ring only renders when a deadline exists (networked play). */
function TurnClock({ clientState }: { clientState: ClientGameState }) {
  const turnRemaining = useCountdown(clientState.deadlines?.turnMs);
  const pendingRemaining = useCountdown(clientState.deadlines?.pendingMs);
  const timerMs = pendingRemaining ?? turnRemaining;
  const timerPct = timerMs === null ? 0 : Math.max(0, Math.min(1, timerMs / 60_000));

  return (
    <div className="opponent-spotlight__clock" aria-label="Turn clock">
      <div className="opponent-spotlight__plays" aria-label={`${clientState.playsRemaining} plays remaining`}>
        {Array.from({ length: MAX_PLAYS }, (_, i) => (
          <span
            key={i}
            className={`play-dot${i < clientState.playsRemaining ? ' play-dot--remaining' : ' play-dot--used'}`}
          />
        ))}
      </div>
      {timerMs !== null && (
        <div className="opponent-spotlight__timer" aria-hidden>
          <span className="opponent-spotlight__timer-ring" style={{ '--timer-pct': timerPct } as CSSProperties} />
          <span className="opponent-spotlight__timer-text">{formatCountdown(timerMs)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Draw automatically as soon as it becomes the viewer's turn — no explicit
 * click needed. Lives here (always mounted) rather than in GameCenter, which
 * only renders while the viewer's own seat is on stage.
 */
function useAutoDraw(clientState: ClientGameState) {
  const draw = useGameStore((api) => api.draw);
  const drawEnabled = useGameStore((api) => api.canDraw)();
  const autoDrawKey = useRef<string | null>(null);
  useEffect(() => {
    if (!drawEnabled) return;
    // Deck size is part of the key so a freshly dealt game (same seat, turn 1 again) still auto-draws.
    const key = `${clientState.currentPlayerId}:${clientState.turnNumber}:${clientState.deckCount}`;
    if (autoDrawKey.current === key) return;
    autoDrawKey.current = key;
    draw();
  }, [drawEnabled, clientState.currentPlayerId, clientState.turnNumber, clientState.deckCount, draw]);
}

/**
 * Rows 1+2 of the board, at every viewport: every player — the viewer
 * included — as a seat on the far rim of the table, and one of them on the
 * paper stage below. An opponent's stage is their real bank pile and sets; the
 * viewer's own stage is the table centre (draw pile, END TURN on their turn,
 * discard pile), never their own board — that's the panel right underneath.
 *
 * Whoever is acting takes the stage at the start of every turn. Tap a seat,
 * swipe the stage, or use the edge arrows to look at someone else; tapping an
 * opponent's seat while they're already on stage opens the read-only inspect
 * modal. Picking up a card to discard pulls the viewer's own stage back so
 * the discard zone is under the finger.
 */
export function OpponentSpotlight({
  clientState,
  showConnection,
  discardHighlight,
  discardDim,
  discardShake,
  onDiscardCard,
}: OpponentSpotlightProps) {
  const { formatMoney } = useCurrency();
  const viewerId = clientState.viewerId;
  useAutoDraw(clientState);

  // Seating order, so ‹ › walk round the table the way turns do.
  let opponentIndex = -1;
  const seats: Seat[] = clientState.players.map((player) => {
    const isSelf = player.id === viewerId;
    if (!isSelf) opponentIndex += 1;
    const realName = nameFor(clientState, player.id);
    return {
      player,
      name: isSelf ? 'You' : realName,
      avatarName: realName,
      color: isSelf ? theme.selfColor : theme.opponentColor(opponentIndex),
      isSelf,
      opponentIndex: isSelf ? -1 : opponentIndex,
    };
  });
  const n = seats.length;
  const actingId = clientState.currentPlayerId;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [slide, setSlide] = useState<'left' | 'right' | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);

  // A new acting player takes the stage back, and nothing stays inspected
  // across turns. A new viewer (pass-and-play seat switch) starts there too.
  useEffect(() => {
    setSelectedId(null);
    setSlide(null);
    setInspectedId(null);
  }, [actingId, clientState.turnNumber, viewerId]);

  const stagedId = (selectedId && seats.some((s) => s.player.id === selectedId) && selectedId) || actingId;
  const stagedIndex = Math.max(
    0,
    seats.findIndex((s) => s.player.id === stagedId),
  );
  const staged = seats[stagedIndex]!;
  const isActing = staged.player.id === actingId;
  const attention = useAttentionFor(staged.player.id);
  const bankAttention = useBankAttention(staged.player.id);

  const showSeat = useCallback(
    (index: number) => {
      const next = seats[index];
      if (!next || next.player.id === stagedId) return;
      setSlide(index > stagedIndex ? 'left' : 'right');
      setSelectedId(next.player.id === actingId ? null : next.player.id);
    },
    [seats, stagedId, stagedIndex, actingId],
  );

  // A card held over the table wants the discard zone on stage.
  const selfIndex = seats.findIndex((s) => s.isSelf);
  const selfStaged = staged.isSelf;
  useEffect(() => {
    if (discardHighlight && !selfStaged && selfIndex >= 0) showSeat(selfIndex);
  }, [discardHighlight, selfStaged, selfIndex, showSeat]);

  const handleSeatTap = useCallback(
    (playerId: string) => {
      if (playerId === stagedId) {
        if (playerId !== viewerId) setInspectedId(playerId);
        return;
      }
      showSeat(seats.findIndex((s) => s.player.id === playerId));
    },
    [seats, stagedId, viewerId, showSeat],
  );
  const handleClose = useCallback(() => setInspectedId(null), []);

  const swipe = useSwipe((dir) => showSeat(stagedIndex - dir));

  const inspectedPlayer = inspectedId ? clientState.players.find((p) => p.id === inspectedId) ?? null : null;
  const stagedPlayer = staged.player;
  const stagedStatus = turnLabelClient(clientState, stagedPlayer.id).toLowerCase();

  return (
    <>
      <section className="opponent-spotlight" aria-label="Table">
        <div className="opponent-rim" role="group" aria-label="Seats at the table">
          {seats.map((seat, i) => (
            <SeatButton
              key={seat.player.id}
              seat={seat}
              t={n === 1 ? 0.5 : 0.14 + (0.72 * i) / (n - 1)}
              isStaged={seat.player.id === stagedId}
              isActing={seat.player.id === actingId}
              showConnection={showConnection}
              bankLabel={formatMoney(playerBankTotal(seat.player))}
              onTap={handleSeatTap}
            />
          ))}
        </div>

        <div className="opponent-spotlight__stage-wrap" {...swipe}>
          <div
            className={`opponent-spotlight__stage attn-host${selfStaged ? ' opponent-spotlight__stage--self' : ''}`}
            key={stagedId}
            data-testid={selfStaged ? 'self-stage' : 'opponent-spotlight'}
            data-player-id={stagedId}
            data-slide={slide ?? undefined}
            data-attention={attention ?? undefined}
            style={{ '--seat': staged.color } as CSSProperties}
          >
            <div className="opponent-spotlight__header">
              <PlayerAvatar
                name={staged.avatarName}
                className="opponent-spotlight__avatar avatar"
                data-self={selfStaged ? 'true' : undefined}
              />
              <div className="opponent-spotlight__meta">
                <span className="opponent-spotlight__name">
                  {staged.name}
                  {isActing && <span className="opponent-spotlight__turn-tag">TURN</span>}
                </span>
                <span className="opponent-spotlight__sub">
                  {stagedPlayer.handCount} in hand
                  {showConnection && !stagedPlayer.connected ? ' · disconnected' : ''}
                  {!isActing ? ` · ${stagedStatus}` : ''}
                </span>
              </div>
              {/* The viewer's own centre (GameCenter) carries its own plays pill + timer. */}
              {isActing && !selfStaged && <TurnClock clientState={clientState} />}
            </div>

            {selfStaged ? (
              <GameCenter
                clientState={clientState}
                discardHighlight={discardHighlight}
                discardDim={discardDim}
                discardShake={discardShake}
                onDiscardCard={onDiscardCard}
                variant="stage"
              />
            ) : (
              <div className="opponent-spotlight__sets" data-testid="opponent-spotlight-sets">
                <CashPile
                  cards={stagedPlayer.board.bank}
                  attention={bankAttention}
                  ariaLabel={`${staged.name}'s bank`}
                  testId={`bank-drop-${stagedPlayer.id}`}
                />
                {stagedPlayer.board.sets.length === 0 ? (
                  <p className="opponent-spotlight__empty empty-note">No property sets yet</p>
                ) : (
                  stagedPlayer.board.sets.map((set) => <PropertySetView key={set.id} set={set} canDrag={false} />)
                )}
              </div>
            )}
          </div>

          {stagedIndex > 0 && (
            <button
              type="button"
              className="opponent-spotlight__arrow opponent-spotlight__arrow--prev"
              onClick={() => showSeat(stagedIndex - 1)}
              aria-label="Previous seat"
            >
              ‹
            </button>
          )}
          {stagedIndex < n - 1 && (
            <button
              type="button"
              className="opponent-spotlight__arrow opponent-spotlight__arrow--next"
              onClick={() => showSeat(stagedIndex + 1)}
              aria-label="Next seat"
            >
              ›
            </button>
          )}
        </div>
      </section>
      {inspectedPlayer && (
        <OpponentInspectModal player={inspectedPlayer} clientState={clientState} onClose={handleClose} />
      )}
    </>
  );
}
