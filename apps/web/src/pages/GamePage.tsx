import { Link, Navigate } from 'react-router-dom';
import { BoardTopRegion } from '../components/BoardTopRegion';
import { CardFlightOverlay } from '../components/CardFlightOverlay';
import { SidePanel } from '../components/SidePanel';
import { GamePrompts, useDiscardSelection } from '../components/GamePrompts';
import { HandFan } from '../components/HandFan';
import { MomentCallout } from '../components/MomentCallout';
import { NoticeStack } from '../components/NoticeStack';
import { PropertiesPanel } from '../components/PropertiesPanel';
import { Toast } from '../components/Toast';
import { WinOverlay } from '../components/WinOverlay';
import { useCardDrawFlights } from '../hooks/useCardDrawFlights';
import { useDragCard } from '../hooks/useDragCard';
import { isDiscardExcessMode } from '../legality';
import { useTableMoments } from '../moments/useTableMoments';
import { useSoundEffects } from '../sound/useSoundEffects';
import { useStoreSnapshot } from '../store';
import { loadLegacyRoomCode } from '../store/session';

/**
 * Legacy /game URL — the room now lives at /rooms/:code (see RoomPage), which
 * is what survives a refresh. Bounce to it when this tab has a room, else home.
 */
export function GamePage() {
  const snapshot = useStoreSnapshot();
  const code = snapshot.roomCode ?? loadLegacyRoomCode();
  return <Navigate to={code ? `/rooms/${code}` : '/'} replace />;
}

/** The networked table. Rendered by RoomPage once the room is playing. */
export function GameView() {
  const snapshot = useStoreSnapshot();
  const clientState = snapshot.clientState;
  const log = snapshot.log;
  useTableMoments(log, clientState, 'network');

  // These hooks must run on every render, including the first one below
  // (before the SSE snapshot arrives, when clientState is still null) —
  // calling them only after the `if (!clientState)` early return changes the
  // hook count between renders and crashes the tree (Rules of Hooks).
  const topPending = clientState?.pendingStack[clientState.pendingStack.length - 1];
  const handLimitExcess =
    clientState && topPending?.kind === 'hand_limit_discard' && topPending.playerId === clientState.you.id
      ? topPending.excess
      : null;
  const { selected: discardSelection, toggle: toggleDiscardSelect, clear: clearDiscardSelection } =
    useDiscardSelection(handLimitExcess);
  const { draggingCardId, selectedCardId, legalZones, onDragStart, onDragEnd, toggleSelect } =
    useDragCard();
  const cardFlights = useCardDrawFlights(log, clientState?.viewerId);
  useSoundEffects(log, clientState, snapshot.rejected, 'network');

  if (!clientState) {
    return (
      <div className="lobby">
        <p>Connecting to game…</p>
      </div>
    );
  }

  const localPlayer = clientState.you;
  const rejected = snapshot.rejected;

  const discardMode = isDiscardExcessMode(clientState, localPlayer.id);
  const boardHighlight = discardMode ? false : legalZones.has('property') || legalZones.has('bank');
  const discardHighlight = discardMode || legalZones.has('discard');
  const isSelectingCard = Boolean(draggingCardId || selectedCardId);
  const boardDim = isSelectingCard && !boardHighlight;
  const discardDim = isSelectingCard && !discardHighlight;

  return (
    <div className="app">
      <header className="network-header">
        <span className="network-header__room">Room {snapshot.roomCode}</span>
        <span className="network-header__status" data-testid="sse-status">
          {snapshot.sseStatus === 'connected' ? '' : 'Reconnecting…'}
        </span>
        <Link to="/" className="network-header__link">
          Lobby
        </Link>
      </header>

      <div className="app__layout">
        <main className="game-board">
          <BoardTopRegion
            clientState={clientState}
            showConnection
            discardHighlight={discardHighlight}
            discardDim={discardDim}
            discardShake={Boolean(rejected)}
            onDiscardCard={discardMode ? toggleDiscardSelect : undefined}
          />

          <div className="game-board__panels">
            <PropertiesPanel
              player={localPlayer}
              clientState={clientState}
              highlight={boardHighlight}
              dim={boardDim}
              shake={Boolean(rejected)}
            />
          </div>

          <HandFan
            cards={localPlayer.hand}
            playerId={localPlayer.id}
            draggingCardId={draggingCardId}
            selectedCardIds={discardMode ? discardSelection : []}
            onCardClick={discardMode ? toggleDiscardSelect : undefined}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            heldCardId={discardMode ? null : selectedCardId}
            onCardSelect={toggleSelect}
          />
        </main>

        <SidePanel entries={log} clientState={clientState} />
      </div>

      <Toast />
      <MomentCallout clientState={clientState} />
      <NoticeStack clientState={clientState} />
      <CardFlightOverlay flights={cardFlights} />
      <GamePrompts
        clientState={clientState}
        discardSelection={discardSelection}
        onDiscardSelect={toggleDiscardSelect}
        onClearDiscardSelection={clearDiscardSelection}
      />
      <WinOverlay clientState={clientState} />
    </div>
  );
}
