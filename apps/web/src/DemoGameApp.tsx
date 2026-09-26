import { useCallback, useEffect, useState } from 'react';
import { FIXTURE_NAMES, type FixtureName } from './fixtureNames';
import { DevControls } from './components/DevControls';
import { useSoundEffects } from './sound/useSoundEffects';
import { getDemoAdapter, setActiveAdapter, useStoreSnapshot } from './store';
import { TableChrome } from './table/chrome/ChromeProvider';
import { DevDeal } from './table/chrome/DevDeal';
import { TableLoading } from './table/chrome/TableLoading';
import { useStoreChrome } from './table/chrome/useStoreChrome';
import { TableScreen } from './table/TableScreen';
import { useLiveGame } from './table/useLiveGame';

const DEFAULT_FIXTURE: FixtureName = 'standardMidGame';
const DEFAULT_PLAYER_COUNT = 4;

/**
 * /demo — a real server-backed room seeded from an engine fixture, with a seat
 * switcher that swaps which seat's real HTTP+SSE session the screen renders. Lets
 * you exercise networked behavior (chat, projections, disconnect handling) across
 * scenarios without manually creating a room and joining as each player by hand
 * every time.
 *
 * The dev drawer (scenario picker, seat switcher, player count) is the "Dev" tab of the
 * table's feed sheet. `TableChrome` wraps the table rather than living in it, so the sheet
 * keeps its open/tab state while a scenario swap unmounts the table and deals a new room.
 */
export function DemoGameApp() {
  setActiveAdapter(getDemoAdapter());

  const [fixtureName, setFixtureName] = useState<FixtureName>(DEFAULT_FIXTURE);
  const [loading, setLoading] = useState(true);
  const snapshot = useStoreSnapshot();
  const clientState = snapshot.clientState;
  const localSeatIndex = snapshot.localSeatIndex;
  const adapter = getDemoAdapter();
  useSoundEffects(snapshot.log, clientState, snapshot.rejected, 'local');

  const handleFixtureChange = useCallback(
    async (name: FixtureName) => {
      setFixtureName(name);
      setLoading(true);
      await adapter.loadFixture?.(name);
      setLoading(false);
    },
    [adapter],
  );

  /** Deal a fresh table of `players` (2-5). */
  const deal = useCallback(
    async (players: number) => {
      setLoading(true);
      await adapter.startNewGame?.(players);
      setLoading(false);
    },
    [adapter],
  );

  useEffect(() => {
    // ?players=N deals a fresh table of that size (2-5) instead of the default
    // fixture, so a dev can open a table of any size without a room.
    // ?fixture=name opens straight on that scenario, one deal instead of two.
    const params = new URLSearchParams(window.location.search);
    const wanted = Number.parseInt(params.get('players') ?? '', 10);
    if (wanted >= 2 && wanted <= 5) {
      void deal(wanted);
      return;
    }
    const fixture = FIXTURE_NAMES.find((name) => name === params.get('fixture'));
    void handleFixtureChange(fixture ?? DEFAULT_FIXTURE);
    // Only on mount: a later seat/fixture change must not re-deal.
  }, []);

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

  // The win card's "Deal again": a fresh default table, same as a first visit without ?players.
  const restart = useCallback(() => void deal(DEFAULT_PLAYER_COUNT), [deal]);
  const g = useLiveGame({ restart });

  const playerCount = clientState?.players.length ?? 0;
  const chrome = useStoreChrome({
    dev: (
      <>
        <DevControls
          fixtureName={fixtureName}
          onFixtureChange={(name) => void handleFixtureChange(name)}
          localSeatIndex={localSeatIndex}
          onSeatChange={handleSeatChange}
          playerCount={playerCount}
        />
        <DevDeal current={playerCount} onDeal={(n) => void deal(n)} />
      </>
    ),
  });

  return (
    <TableChrome {...chrome}>
      {g ? <TableScreen g={g} /> : <TableLoading label={loading ? 'Loading demo scenario…' : 'Connecting…'} />}
    </TableChrome>
  );
}
