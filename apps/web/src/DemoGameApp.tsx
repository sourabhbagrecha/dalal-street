import { useCallback, useEffect, useState } from 'react';
import type { FixtureName } from './fixtureNames';
import { BoardTopRegion, spotlitOpponent } from './components/BoardTopRegion';
import { CardFlightOverlay } from './components/CardFlightOverlay';
import { SidePanel } from './components/SidePanel';
import { DevControls } from './components/DevControls';
import { GamePrompts, useDiscardSelection } from './components/GamePrompts';
import { HandFan } from './components/HandFan';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Toast } from './components/Toast';
import { WinOverlay } from './components/WinOverlay';
import { useCardDrawFlights } from './hooks/useCardDrawFlights';
import { useDragCard } from './hooks/useDragCard';
import { isDiscardExcessMode } from './legality';
import { getDemoAdapter, setActiveAdapter, useStoreSnapshot } from './store';

const DEFAULT_FIXTURE: FixtureName = 'standardMidGame';

/**
 * /demo — a real server-backed room (not the engine-only /local pass-and-play) seeded
 * from an engine fixture, with a seat switcher that swaps which seat's real HTTP+SSE
 * session the screen renders. Lets you exercise networked behavior (chat, projections,
 * disconnect handling) across scenarios without manually creating a room and joining
 * as each player by hand every time.
 */
export function DemoGameApp() {
  setActiveAdapter(getDemoAdapter());

  const [fixtureName, setFixtureName] = useState<FixtureName>(DEFAULT_FIXTURE);
  const [loading, setLoading] = useState(true);
  const snapshot = useStoreSnapshot();
  const clientState = snapshot.clientState;
  const log = snapshot.log;
  const localSeatIndex = snapshot.localSeatIndex;
  const rejected = snapshot.rejected;
  const adapter = getDemoAdapter();

  const handleFixtureChange = useCallback(
    async (name: FixtureName) => {
      setFixtureName(name);
      setLoading(true);
      await adapter.loadFixture?.(name);
      setLoading(false);
    },
    [adapter],
  );

  useEffect(() => {
    void handleFixtureChange(DEFAULT_FIXTURE);
  }, [handleFixtureChange]);

  const handleSeatChange = useCallback(
    (index: number) => {
      adapter.setSeat?.(index);
    },
    [adapter],
  );

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
      const playerCount = clientState?.players.length ?? 0;
      if (seat >= 1 && seat <= playerCount) {
        adapter.setSeat?.(seat - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clientState?.players.length, adapter]);

  const localPlayer = clientState?.you;

  const topPending = clientState?.pendingStack[clientState.pendingStack.length - 1];
  const handLimitExcess =
    topPending?.kind === 'hand_limit_discard' && topPending.playerId === localPlayer?.id
      ? topPending.excess
      : null;
  // Hooks must run unconditionally every render — clientState starts null while the
  // demo scenario loads over the network, so the "not ready yet" return has to come
  // after every hook call below, not before.
  const { selected: discardSelection, toggle: toggleDiscardSelect, clear: clearDiscardSelection } =
    useDiscardSelection(handLimitExcess);

  const { draggingCardId, selectedCardId, legalZones, onDragStart, onDragEnd, toggleSelect } =
    useDragCard();
  const cardFlights = useCardDrawFlights(log, clientState?.viewerId);

  if (!clientState || !localPlayer) {
    return (
      <div className="lobby">
        <p>{loading ? 'Loading demo scenario…' : 'Connecting…'}</p>
      </div>
    );
  }

  const discardMode = isDiscardExcessMode(clientState, localPlayer.id);
  const boardHighlight = discardMode ? false : legalZones.has('property') || legalZones.has('bank');
  const discardHighlight = discardMode || legalZones.has('discard');
  const isSelectingCard = Boolean(draggingCardId || selectedCardId);
  const boardDim = isSelectingCard && !boardHighlight;
  const discardDim = isSelectingCard && !discardHighlight;
  const spotlit = Boolean(spotlitOpponent(clientState));

  return (
    <div className="app">
      <div className="app__layout">
        <main className={spotlit ? 'game-board game-board--spotlight' : 'game-board'}>
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

        <SidePanel
          entries={log}
          clientState={clientState}
          devControls={
            <DevControls
              fixtureName={fixtureName}
              onFixtureChange={(name) => void handleFixtureChange(name)}
              localSeatIndex={localSeatIndex}
              onSeatChange={handleSeatChange}
              playerCount={clientState.players.length}
            />
          }
        />
      </div>

      <Toast />
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
