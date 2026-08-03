import { useCallback, useEffect, useState } from 'react';
import type { FixtureName } from '@monopoly-deal/engine';
import { BankPanel } from './components/BankPanel';
import { ChatPanel } from './components/ChatPanel';
import { DevControls } from './components/DevControls';
import { GameCenter } from './components/GameCenter';
import { GamePrompts, useDiscardSelection } from './components/GamePrompts';
import { HandFan } from './components/HandFan';
import { OpponentRail } from './components/OpponentRail';
import { PropertiesPanel } from './components/PropertiesPanel';
import { TableFeed } from './components/TableFeed';
import { Toast } from './components/Toast';
import { WinOverlay } from './components/WinOverlay';
import { useDragCard } from './hooks/useDragCard';
import { isDiscardExcessMode } from './legality';
import { useGameStore, selectLocalPlayer } from './store';

const DEFAULT_FIXTURE: FixtureName = 'standardMidGame';

export function App() {
  const [fixtureName, setFixtureName] = useState<FixtureName>(DEFAULT_FIXTURE);
  const state = useGameStore((s) => s.state);
  const log = useGameStore((s) => s.log);
  const localSeatIndex = useGameStore((s) => s.localSeatIndex);
  const setSeat = useGameStore((s) => s.setSeat);
  const loadFixture = useGameStore((s) => s.loadFixture);
  const rejected = useGameStore((s) => s.rejected);
  const localPlayer = useGameStore(selectLocalPlayer);

  const topPending = state.pendingStack[state.pendingStack.length - 1];
  const handLimitExcess =
    topPending?.kind === 'hand_limit_discard' && topPending.playerId === localPlayer.id
      ? topPending.excess
      : null;
  const { selected: discardSelection, toggle: toggleDiscardSelect, clear: clearDiscardSelection } =
    useDiscardSelection(handLimitExcess);

  const { draggingCardId, legalZones, onDragStart, onDragEnd } = useDragCard();

  const discardMode = isDiscardExcessMode(state, localPlayer.id);
  const bankHighlight = discardMode ? false : legalZones.has('bank');
  const propertyHighlight = discardMode ? false : legalZones.has('property');
  const discardHighlight = discardMode || legalZones.has('discard');

  const handleFixtureChange = useCallback(
    (name: FixtureName) => {
      setFixtureName(name);
      loadFixture(name);
    },
    [loadFixture],
  );

  const handleSeatChange = useCallback(
    (index: number) => {
      setSeat(index);
    },
    [setSeat],
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
      if (seat >= 1 && seat <= state.players.length) {
        setSeat(seat - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.players.length, setSeat]);

  useEffect(() => {
    if (localSeatIndex >= state.players.length) {
      setSeat(0);
    }
  }, [localSeatIndex, state.players.length, setSeat]);

  return (
    <div className="app">
      <DevControls
        fixtureName={fixtureName}
        onFixtureChange={handleFixtureChange}
        localSeatIndex={localSeatIndex}
        onSeatChange={handleSeatChange}
        playerCount={state.players.length}
      />

      <div className="app__layout">
        <main className="game-board">
          <OpponentRail state={state} localPlayerId={localPlayer.id} />

          <GameCenter
            state={state}
            localPlayerId={localPlayer.id}
            discardHighlight={discardHighlight}
            discardShake={Boolean(rejected)}
            onDiscardCard={discardMode ? toggleDiscardSelect : undefined}
          />

          <div className="game-board__panels">
            <PropertiesPanel
              player={localPlayer}
              highlight={propertyHighlight}
              shake={Boolean(rejected)}
            />
            <BankPanel
              player={localPlayer}
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
          <TableFeed entries={log} />
          <ChatPanel />
        </aside>
      </div>

      <Toast />
      <GamePrompts
        state={state}
        localPlayerId={localPlayer.id}
        discardSelection={discardSelection}
        onDiscardSelect={toggleDiscardSelect}
        onClearDiscardSelection={clearDiscardSelection}
      />
      <WinOverlay />
    </div>
  );
}
