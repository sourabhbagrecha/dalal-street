import { useCallback, useEffect, useState } from 'react';
import type { FixtureName } from './fixtureNames';
import { BoardTopRegion, spotlitOpponent } from './components/BoardTopRegion';
import { CardFlightOverlay } from './components/CardFlightOverlay';
import { SidePanel } from './components/SidePanel';
import { DevControls } from './components/DevControls';
import { HandoffCurtain } from './components/HandoffCurtain';
import { LocalHud } from './components/LocalHud';
import { GamePrompts, useDiscardSelection } from './components/GamePrompts';
import { HandFan } from './components/HandFan';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Toast } from './components/Toast';
import { WinOverlay } from './components/WinOverlay';
import { viewerHasPendingPrompt } from './components/curtainGate';
import { seatIdentityName } from './components/localSeatName';
import { useCardDrawFlights } from './hooks/useCardDrawFlights';
import { useDragCard } from './hooks/useDragCard';
import { isDiscardExcessMode } from './legality';
import { getLocalAdapter, setActiveAdapter, useStoreSnapshot } from './store';

const DEFAULT_FIXTURE: FixtureName = 'standardMidGame';

// Dev-only chrome (scenario picker, raw seat switcher) is a real player entry
// point via the lobby's "Pass & play (local)" link, so it must not leak to
// ordinary players: gate it behind Vite's dev build flag, with a `?dev=1`
// escape hatch for exercising it against a production build.
function isDevToolingEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('dev');
}

export function LocalGameApp() {
  setActiveAdapter(getLocalAdapter());

  const [fixtureName, setFixtureName] = useState<FixtureName>(DEFAULT_FIXTURE);
  const snapshot = useStoreSnapshot();
  const clientState = snapshot.clientState;
  const log = snapshot.log;
  const localSeatIndex = snapshot.localSeatIndex;
  const rejected = snapshot.rejected;
  const adapter = getLocalAdapter();
  const cardFlights = useCardDrawFlights(log, clientState?.viewerId);

  if (!clientState) return null;

  const localPlayer = clientState.you;

  const topPending = clientState.pendingStack[clientState.pendingStack.length - 1];
  const handLimitExcess =
    topPending?.kind === 'hand_limit_discard' && topPending.playerId === localPlayer.id
      ? topPending.excess
      : null;
  const { selected: discardSelection, toggle: toggleDiscardSelect, clear: clearDiscardSelection } =
    useDiscardSelection(handLimitExcess);

  const { draggingCardId, selectedCardId, legalZones, onDragStart, onDragEnd, toggleSelect } =
    useDragCard();

  const discardMode = isDiscardExcessMode(clientState, localPlayer.id);
  const boardHighlight = discardMode ? false : legalZones.has('property') || legalZones.has('bank');
  const discardHighlight = discardMode || legalZones.has('discard');
  const isSelectingCard = Boolean(draggingCardId || selectedCardId);
  const heldCardId = draggingCardId ?? selectedCardId;
  const heldCard = heldCardId
    ? localPlayer.hand.find((c) => c.id === heldCardId)
    : undefined;
  const boardDim = isSelectingCard && !boardHighlight;
  const discardDim = isSelectingCard && !discardHighlight;

  const handleFixtureChange = useCallback(
    (name: FixtureName) => {
      setFixtureName(name);
      adapter.loadFixture?.(name);
    },
    [adapter],
  );

  const handleSeatChange = useCallback(
    (index: number) => {
      adapter.setSeat?.(index);
    },
    [adapter],
  );

  const handleNewGame = useCallback(() => {
    adapter.startNewGame?.();
  }, [adapter]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      const seat = Number.parseInt(e.key, 10);
      const playerCount = clientState.players.length;
      if (seat >= 1 && seat <= playerCount) {
        adapter.setSeat?.(seat - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clientState.players.length, adapter]);

  useEffect(() => {
    const playerCount = clientState.players.length;
    if (localSeatIndex >= playerCount) {
      adapter.setSeat?.(0);
    }
  }, [localSeatIndex, clientState.players.length, adapter]);

  const spotlit = Boolean(spotlitOpponent(clientState));
  // Same condition BoardTopRegion uses to swap in OpponentSpotlight: the
  // seated device isn't the current player's seat. The curtain sits on top
  // of that spotlight (rather than replacing it) so it's a pure overlay —
  // opaque, above everything, dismissible only by its own button. But "not
  // the current player's seat" alone isn't enough: a rent/birthday payment,
  // a Just Say No response, or a hand-limit discard can all land on the
  // currently-seated player while it's someone ELSE's turn (that's the
  // normal shape of a rent charge). If the seated player has one of those
  // pending, they need GamePrompts, not a curtain telling them to hand the
  // phone to whoever's turn it nominally is.
  const awaitingHandoff = spotlit && !viewerHasPendingPrompt(clientState, localPlayer.id);
  const showDevControls = isDevToolingEnabled();

  return (
    <div className={showDevControls ? 'app app--dev-tools' : 'app'}>
      <div className="app__layout">
        <main className={spotlit ? 'game-board game-board--spotlight' : 'game-board'}>
          <BoardTopRegion
            clientState={clientState}
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
              heldCard={heldCard}
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

        <SidePanel
          entries={log}
          clientState={clientState}
          devControls={
            showDevControls ? (
              <DevControls
                fixtureName={fixtureName}
                onFixtureChange={handleFixtureChange}
                localSeatIndex={localSeatIndex}
                onSeatChange={handleSeatChange}
                playerCount={clientState.players.length}
              />
            ) : undefined
          }
          localControls={
            <button
              type="button"
              className="side-panel__new-game-btn"
              data-testid="side-panel-new-game"
              onClick={handleNewGame}
            >
              New game
            </button>
          }
        />
      </div>

      <LocalHud seatName={seatIdentityName(clientState, localSeatIndex)} onNewGame={handleNewGame} />

      <Toast />
      <CardFlightOverlay flights={cardFlights} />
      <GamePrompts
        clientState={clientState}
        discardSelection={discardSelection}
        onDiscardSelect={toggleDiscardSelect}
        onClearDiscardSelection={clearDiscardSelection}
      />
      <WinOverlay clientState={clientState} onRestart={() => adapter.startNewGame?.()} />
      {awaitingHandoff && (
        <HandoffCurtain
          clientState={clientState}
          lastTurnEnd={snapshot.lastTurnEnd}
          onTakeSeat={(index) => adapter.setSeat?.(index)}
        />
      )}
    </div>
  );
}
