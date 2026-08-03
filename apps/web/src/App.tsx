import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FixtureName } from '@monopoly-deal/engine';
import { BankPanel } from './components/BankPanel';
import { ChatPanel } from './components/ChatPanel';
import { DevControls } from './components/DevControls';
import { GameCenter } from './components/GameCenter';
import { HandFan } from './components/HandFan';
import { OpponentRail } from './components/OpponentRail';
import { PropertiesPanel } from './components/PropertiesPanel';
import { TableFeed } from './components/TableFeed';
import { deriveFixtureLog, loadFixture } from './fixtureLog';

const DEFAULT_FIXTURE: FixtureName = 'standardMidGame';

export function App() {
  const [fixtureName, setFixtureName] = useState<FixtureName>(DEFAULT_FIXTURE);
  const [localSeatIndex, setLocalSeatIndex] = useState(0);

  const state = useMemo(() => loadFixture(fixtureName), [fixtureName]);
  const localPlayer = state.players[localSeatIndex] ?? state.players[0]!;
  const logEntries = useMemo(
    () => deriveFixtureLog(state, fixtureName),
    [state, fixtureName],
  );

  const handleSeatChange = useCallback(
    (index: number) => {
      if (index >= 0 && index < state.players.length) {
        setLocalSeatIndex(index);
      }
    },
    [state.players.length],
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
        setLocalSeatIndex(seat - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.players.length]);

  useEffect(() => {
    if (localSeatIndex >= state.players.length) {
      setLocalSeatIndex(0);
    }
  }, [localSeatIndex, state.players.length]);

  return (
    <div className="app">
      <DevControls
        fixtureName={fixtureName}
        onFixtureChange={setFixtureName}
        localSeatIndex={localSeatIndex}
        onSeatChange={handleSeatChange}
        playerCount={state.players.length}
      />

      <div className="app__layout">
        <main className="game-board">
          <OpponentRail state={state} localPlayerId={localPlayer.id} />

          <GameCenter state={state} localPlayerId={localPlayer.id} />

          <div className="game-board__panels">
            <PropertiesPanel player={localPlayer} />
            <BankPanel player={localPlayer} />
          </div>

          <HandFan cards={localPlayer.hand} />
        </main>

        <aside className="side-panel">
          <TableFeed entries={logEntries} />
          <ChatPanel />
        </aside>
      </div>
    </div>
  );
}
