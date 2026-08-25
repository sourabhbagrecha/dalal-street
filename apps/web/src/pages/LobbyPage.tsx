import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChatPanel } from '../components/ChatPanel';
import {
  getNetworkAdapter,
  setActiveAdapter,
  useStoreSnapshot,
} from '../store';

export function LobbyPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(
    () => sessionStorage.getItem('md_displayName') ?? '',
  );
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setActiveAdapter(getNetworkAdapter());
    getNetworkAdapter().reconnect?.();
  }, []);

  const snapshot = useStoreSnapshot();
  const adapter = getNetworkAdapter();
  const room = snapshot.room;
  const inRoom = Boolean(snapshot.roomCode && snapshot.playerToken);

  useEffect(() => {
    if (snapshot.clientState) {
      navigate('/game', { replace: true });
      return;
    }
    if (room?.status === 'playing' && snapshot.roomCode) {
      navigate('/game', { replace: true });
    }
  }, [room?.status, snapshot.clientState, snapshot.roomCode, navigate]);

  const handleCreate = async () => {
    if (!displayName.trim()) return;
    setBusy(true);
    sessionStorage.setItem('md_displayName', displayName.trim());
    await adapter.createRoom?.(displayName.trim());
    setBusy(false);
  };

  const handleJoin = async () => {
    if (!displayName.trim() || !joinCode.trim()) return;
    setBusy(true);
    sessionStorage.setItem('md_displayName', displayName.trim());
    await adapter.joinRoom?.(joinCode.trim(), displayName.trim());
    setBusy(false);
  };

  const handleStart = async () => {
    setBusy(true);
    await adapter.startGame?.();
    setBusy(false);
  };

  return (
    <div className="lobby">
      <header className="lobby__header">
        <h1 className="lobby__title">Monopoly Deal</h1>
        <nav className="lobby__links">
          <Link to="/rules" className="lobby__local-link">
            Rules &amp; cards
          </Link>
          <Link to="/local" className="lobby__local-link">
            Pass &amp; play (local)
          </Link>
        </nav>
      </header>

      <div className="lobby__card">
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

        {!inRoom ? (
          <div className="lobby__actions">
            <button
              type="button"
              className="prompt-btn prompt-btn--primary"
              disabled={busy || !displayName.trim()}
              onClick={() => void handleCreate()}
              data-testid="create-room-btn"
            >
              Create room
            </button>

            <div className="lobby__join">
              <input
                type="text"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Room code"
                data-testid="join-code-input"
              />
              <button
                type="button"
                className="prompt-btn"
                disabled={busy || !displayName.trim() || joinCode.length < 6}
                onClick={() => void handleJoin()}
                data-testid="join-room-btn"
              >
                Join
              </button>
            </div>
          </div>
        ) : (
          <div className="lobby__room">
            <p className="lobby__code">
              Room code: <strong data-testid="room-code">{snapshot.roomCode}</strong>
            </p>
            <p className="lobby__status">
              Status: {room?.status ?? 'connecting…'}
              {snapshot.sseStatus === 'error' && (
                <span className="lobby__error"> — connection lost</span>
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
              onClick={() => void adapter.leaveRoom?.()}
            >
              Leave room
            </button>

            <div className="lobby__chat">
              <ChatPanel />
            </div>
          </div>
        )}

        {snapshot.lobbyError && (
          <p className="lobby__error" role="alert" data-testid="lobby-error">
            {snapshot.lobbyError}
          </p>
        )}
      </div>
    </div>
  );
}
