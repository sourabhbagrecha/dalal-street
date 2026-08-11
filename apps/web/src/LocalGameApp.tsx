import { useCallback, useEffect, useState } from 'react';
import type { FixtureName } from './fixtureNames';
import { BankPanel } from './components/BankPanel';
import { CardFlightOverlay } from './components/CardFlightOverlay';
import { SidePanel } from './components/SidePanel';
import { DevControls } from './components/DevControls';
import { GameCenter } from './components/GameCenter';
import { GamePrompts, useDiscardSelection } from './components/GamePrompts';
import { HandFan } from './components/HandFan';
import { OpponentRail } from './components/OpponentRail';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Toast } from './components/Toast';
import { WinOverlay } from './components/WinOverlay';
import { useCardDrawFlights } from './hooks/useCardDrawFlights';
import { useDragCard } from './hooks/useDragCard';
import { isDiscardExcessMode } from './legality';
import { getLocalAdapter, setActiveAdapter, useStoreSnapshot } from './store';

const DEFAULT_FIXTURE: FixtureName = 'standardMidGame';

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
  const bankHighlight = discardMode ? false : legalZones.has('bank');
  const propertyHighlight = discardMode ? false : legalZones.has('property');
  const discardHighlight = discardMode || legalZones.has('discard');
  const isSelectingCard = Boolean(draggingCardId || selectedCardId);
  const bankDim = isSelectingCard && !bankHighlight;
  const propertyDim = isSelectingCard && !propertyHighlight;
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

  return (
    <div className="app">
      <div className="app__layout">
        <main className="game-board">
          <OpponentRail clientState={clientState} />

          <GameCenter
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
              highlight={propertyHighlight}
              dim={propertyDim}
              shake={Boolean(rejected)}
            />
            <BankPanel
              player={localPlayer}
              clientState={clientState}
              highlight={bankHighlight}
              dim={bankDim}
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
              onFixtureChange={handleFixtureChange}
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
      <WinOverlay clientState={clientState} onRestart={() => adapter.startNewGame?.()} />
    </div>
  );
}
