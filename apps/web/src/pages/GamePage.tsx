import { useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useSoundEffects } from '../sound/useSoundEffects';
import { useStoreSnapshot } from '../store';
import { loadLegacyRoomCode } from '../store/session';
import { computeRecap } from '../table/recap';
import { TableChrome } from '../table/chrome/ChromeProvider';
import { TableLoading } from '../table/chrome/TableLoading';
import { useStoreChrome } from '../table/chrome/useStoreChrome';
import { TableScreen } from '../table/TableScreen';
import { useLiveGame } from '../table/useLiveGame';

/**
 * Legacy /game URL — the room now lives at /rooms/:code (see RoomPage), which
 * is what survives a refresh. Bounce to it when this tab has a room, else home.
 */
export function GamePage() {
  const snapshot = useStoreSnapshot();
  const code = snapshot.roomCode ?? loadLegacyRoomCode();
  return <Navigate to={code ? `/rooms/${code}` : '/'} replace />;
}

/**
 * The networked table. Rendered by RoomPage once the room is playing. The table itself is `TableScreen` fed by
 * `useLiveGame`; everything around it (feed/chat sheet, room code + lobby link, reconnect banner, rejected-command
 * toast) is `TableChrome`, which stays mounted while the first projection is still on its way.
 */
export function GameView() {
  const snapshot = useStoreSnapshot();
  // Every render, including the first (before the SSE snapshot arrives): hooks never sit behind the loading state.
  const g = useLiveGame();
  // Sounds release on the beat `g` just acted out (see useSoundEffects), not on the raw event log.
  useSoundEffects(snapshot.log, snapshot.clientState, snapshot.rejected, 'network', g?.beat ?? null);
  const chrome = useStoreChrome({ room: true });
  const navigate = useNavigate();
  // The server sends a projection only while a game is being played, so a tab that (re)opens a finished room never gets
  // one: without this it would sit on "Connecting…" for ever with no way out.
  const ended = !g && snapshot.room?.status === 'finished';
  // The victory card's whole-game stats — derived from the log already on hand, nothing new tracked for it.
  const recap = useMemo(
    () => (g?.won && snapshot.clientState ? computeRecap(snapshot.log, snapshot.clientState) : null),
    [g?.won, snapshot.log, snapshot.clientState],
  );

  return (
    <TableChrome {...chrome}>
      {g ? (
        <TableScreen g={g} recap={recap} />
      ) : ended ? (
        <TableLoading label="This game has ended." exit={{ label: 'Back to lobby', onClick: () => navigate('/') }} />
      ) : (
        <TableLoading label="Connecting to game…" />
      )}
    </TableChrome>
  );
}
