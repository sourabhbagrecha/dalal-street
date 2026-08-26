import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChatPanel } from '../components/ChatPanel';
import { getNetworkAdapter, setActiveAdapter, useStoreSnapshot } from '../store';
import { loadDisplayName } from '../store/session';
import { GameView } from './GamePage';

/**
 * /rooms/:code — the one URL for a room. On mount it restores the seat stored
 * for that code (refresh, new tab, server restart) and then renders whichever
 * of three things applies: a join form (no seat here yet — an invite link), the
 * waiting room (seat held, game not started), or the table.
 */
export function RoomPage() {
  const { code: rawCode = '' } = useParams();
  const code = rawCode.toUpperCase();
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    const adapter = getNetworkAdapter();
    setActiveAdapter(adapter);
    let cancelled = false;
    setRestoring(true);
    void adapter.reconnect?.(code).finally(() => {
      if (!cancelled) setRestoring(false);
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const snapshot = useStoreSnapshot();
  const seated = snapshot.roomCode === code && Boolean(snapshot.playerToken);

  if (!seated) {
    if (restoring) {
      return (
        <div className="lobby">
          <p>Connecting to room {code}…</p>
        </div>
      );
    }
    return <JoinRoomForm code={code} />;
  }

  const status = snapshot.room?.status;
  if (snapshot.clientState || status === 'playing' || status === 'finished') {
    return <GameView />;
  }
  return <WaitingRoom code={code} />;
}

function JoinRoomForm({ code }: { code: string }) {
  const snapshot = useStoreSnapshot();
  const adapter = getNetworkAdapter();
  const [displayName, setDisplayName] = useState(loadDisplayName);
  const [busy, setBusy] = useState(false);

  const handleJoin = async () => {
    if (!displayName.trim()) return;
    setBusy(true);
    await adapter.joinRoom?.(code, displayName.trim());
    setBusy(false);
  };

  const error =
    snapshot.lobbyError && (snapshot.staleRoomCode === null || snapshot.staleRoomCode === code)
      ? snapshot.lobbyError
      : null;

  return (
    <div className="lobby">
      <header className="lobby__header">
        <h1 className="lobby__title">Monopoly Deal</h1>
        <nav className="lobby__links">
          <Link to="/" className="lobby__local-link">
            Home
          </Link>
        </nav>
      </header>

      <div className="lobby__card">
        <p className="lobby__code">
          Join room <strong data-testid="invite-code">{code}</strong>
        </p>
        <label className="lobby__field">
          <span>Display name</span>
          <input
            type="text"
            maxLength={24}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            data-testid="display-name-input"
          />
        </label>
        <div className="lobby__actions">
          <button
            type="button"
            className="prompt-btn prompt-btn--primary"
            disabled={busy || !displayName.trim()}
            onClick={() => void handleJoin()}
            data-testid="join-room-btn"
          >
            Join
          </button>
        </div>
        {error && (
          <p className="lobby__error" role="alert" data-testid="lobby-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function WaitingRoom({ code }: { code: string }) {
  const snapshot = useStoreSnapshot();
  const adapter = getNetworkAdapter();
  const room = snapshot.room;
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const handleLeave = async () => {
    setBusy(true);
    await adapter.leaveRoom?.();
    navigate('/');
  };

  const handleStart = async () => {
    setBusy(true);
    await adapter.startGame?.();
    setBusy(false);
  };

  const inviteUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/rooms/${code}` : `/rooms/${code}`;

  return (
    <div className="lobby">
      <header className="lobby__header">
        <h1 className="lobby__title">Monopoly Deal</h1>
        <nav className="lobby__links">
          <Link to="/rules" className="lobby__local-link">
            Rules &amp; cards
          </Link>
        </nav>
      </header>

      <div className="lobby__card">
        <div className="lobby__room">
          <p className="lobby__code">
            Room code: <strong data-testid="room-code">{code}</strong>
          </p>
          <p className="lobby__status">
            Invite link: <code data-testid="invite-link">{inviteUrl}</code>
          </p>
          <p className="lobby__status">
            Status: {room?.status ?? 'connecting…'}
            {snapshot.sseStatus === 'error' && (
              <span className="lobby__error"> — connection lost, retrying</span>
            )}
          </p>

          <ul className="lobby__seats" data-testid="seat-list">
            {(room?.seats ?? []).map((seat) => (
              <li
                key={seat.playerId}
                className={`lobby__seat${seat.playerId === snapshot.playerId ? ' lobby__seat--you' : ''}`}
              >
                <span className="lobby__seat-name">{seat.displayName}</span>
                {seat.isHost && <span className="lobby__host-badge">Host</span>}
                {!seat.connected && (
                  <span className="lobby__disconnected-badge">Disconnected</span>
                )}
              </li>
            ))}
          </ul>

          {snapshot.isHost && room?.status === 'lobby' && (
            <button
              type="button"
              className="prompt-btn prompt-btn--primary"
              disabled={busy || (room?.seats.length ?? 0) < 2}
              onClick={() => void handleStart()}
              data-testid="start-game-btn"
            >
              Start game ({room?.seats.length ?? 0} players)
            </button>
          )}

          <button
            type="button"
            className="prompt-btn"
            disabled={busy}
            onClick={() => void handleLeave()}
          >
            Leave room
          </button>

          <div className="lobby__chat">
            <ChatPanel />
          </div>
        </div>

        {snapshot.lobbyError && (
          <p className="lobby__error" role="alert" data-testid="lobby-error">
            {snapshot.lobbyError}
          </p>
        )}
      </div>
    </div>
  );
}
