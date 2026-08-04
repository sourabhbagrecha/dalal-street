import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BankPanel } from '../components/BankPanel';
import { ChatPanel } from '../components/ChatPanel';
import { GameCenter } from '../components/GameCenter';
import { GamePrompts, useDiscardSelection } from '../components/GamePrompts';
import { HandFan } from '../components/HandFan';
import { OpponentRail } from '../components/OpponentRail';
import { PropertiesPanel } from '../components/PropertiesPanel';
import { TableFeed } from '../components/TableFeed';
import { Toast } from '../components/Toast';
import { WinOverlay } from '../components/WinOverlay';
import { useDragCard } from '../hooks/useDragCard';
import { isDiscardExcessMode } from '../legality';
import { getNetworkAdapter, setActiveAdapter, useStoreSnapshot } from '../store';

export function GamePage() {
  const navigate = useNavigate();

  useEffect(() => {
    setActiveAdapter(getNetworkAdapter());
    getNetworkAdapter().reconnect?.();
  }, []);

  const snapshot = useStoreSnapshot();
  const clientState = snapshot.clientState;

  useEffect(() => {
    if (!snapshot.roomCode) {
      navigate('/', { replace: true });
      return;
    }
    if (snapshot.room?.status === 'lobby' && !clientState) {
      navigate('/', { replace: true });
    }
  }, [snapshot.roomCode, snapshot.room?.status, clientState, navigate]);

  if (!clientState) {
    return (
      <div className="lobby">
        <p>Connecting to game…</p>
      </div>
    );
  }

  const localPlayer = clientState.you;
  const rejected = snapshot.rejected;
  const log = snapshot.log;

  const topPending = clientState.pendingStack[clientState.pendingStack.length - 1];
  const handLimitExcess =
    topPending?.kind === 'hand_limit_discard' && topPending.playerId === localPlayer.id
      ? topPending.excess
      : null;
  const { selected: discardSelection, toggle: toggleDiscardSelect, clear: clearDiscardSelection } =
    useDiscardSelection(handLimitExcess);

  const { draggingCardId, legalZones, onDragStart, onDragEnd } = useDragCard();

  const discardMode = isDiscardExcessMode(clientState, localPlayer.id);
  const bankHighlight = discardMode ? false : legalZones.has('bank');
  const propertyHighlight = discardMode ? false : legalZones.has('property');
  const discardHighlight = discardMode || legalZones.has('discard');

  return (
    <div className="app">
      <header className="network-header">
        <span className="network-header__room">Room {snapshot.roomCode}</span>
        <Link to="/" className="network-header__link">
          Lobby
        </Link>
      </header>

      <div className="app__layout">
        <main className="game-board">
          <OpponentRail clientState={clientState} showConnection />

          <GameCenter
            clientState={clientState}
            discardHighlight={discardHighlight}
            discardShake={Boolean(rejected)}
            onDiscardCard={discardMode ? toggleDiscardSelect : undefined}
          />

          <div className="game-board__panels">
            <PropertiesPanel
              player={localPlayer}
              clientState={clientState}
              highlight={propertyHighlight}
              shake={Boolean(rejected)}
            />
            <BankPanel
              player={localPlayer}
              clientState={clientState}
              highlight={bankHighlight}
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
          />
        </main>

        <aside className="side-panel">
          <TableFeed entries={log} clientState={clientState} />
          <ChatPanel />
        </aside>
      </div>

      <Toast />
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
