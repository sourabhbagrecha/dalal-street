import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getNetworkAdapter, setActiveAdapter, useStoreSnapshot } from '../store';
import { loadDisplayName } from '../store/session';
// Renders `.lobby__*` markup - loaded after cards.css/styles.css via main.tsx's
// import order (this module is imported from App.tsx, after those globals).
import '../styles/lobby.css';

/** Home: create a room or join one by code. Rooms themselves live at /rooms/:code. */
export function LobbyPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(loadDisplayName);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setActiveAdapter(getNetworkAdapter());
  }, []);

  const snapshot = useStoreSnapshot();
  const adapter = getNetworkAdapter();
  // A seat this tab already holds (e.g. came here via the table's "Lobby" link).
  const currentRoom = snapshot.roomCode && snapshot.playerToken ? snapshot.roomCode : null;

  const handleCreate = async () => {
    if (!displayName.trim()) return;
    setBusy(true);
    await adapter.createRoom?.(displayName.trim());
    setBusy(false);
    const code = adapter.getSnapshot().roomCode;
    if (code) navigate(`/rooms/${code}`);
  };

  const handleJoin = async () => {
    if (!displayName.trim() || !joinCode.trim()) return;
    setBusy(true);
    await adapter.joinRoom?.(joinCode.trim(), displayName.trim());
    setBusy(false);
    const code = adapter.getSnapshot().roomCode;
    if (code) navigate(`/rooms/${code}`);
  };

  return (
    <div className="lobby">
      <header className="lobby__header">
        <h1 className="lobby__title">Monopoly Deal</h1>
        <nav className="lobby__links">
          <Link to="/rules" className="lobby__local-link">
            Rules &amp; cards
          </Link>
          <Link to="/demo" className="lobby__local-link">
            Pass &amp; play (demo)
          </Link>
        </nav>
      </header>

      <div className="lobby__card">
        {currentRoom && (
          <p className="lobby__status">
            You have a seat in room <strong>{currentRoom}</strong>.{' '}
            <Link to={`/rooms/${currentRoom}`} data-testid="return-to-room">
              Return to it
            </Link>
          </p>
        )}

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

        {snapshot.lobbyError && (
          <p className="lobby__error" role="alert" data-testid="lobby-error">
            {snapshot.lobbyError}
          </p>
        )}
      </div>
    </div>
  );
}
