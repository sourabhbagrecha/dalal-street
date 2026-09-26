import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getNetworkAdapter, setActiveAdapter, useStoreSnapshot } from '../store';
import { loadDisplayName } from '../store/session';
import { Hero } from '../lobby/Hero';
import { CodeInput, NameField } from '../lobby/fields';
import { LobbyIcon } from '../lobby/icons';
import { LobbyBar, LobbyShell, RulesLink } from '../lobby/LobbyShell';
import { ROOM_CODE_LENGTH } from '../lobby/roomCode';

/** Home: create a room or join one by code. Rooms themselves live at /rooms/:code. */
export function LobbyPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(loadDisplayName);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  useEffect(() => {
    setActiveAdapter(getNetworkAdapter());
  }, []);

  const snapshot = useStoreSnapshot();
  const adapter = getNetworkAdapter();
  // A seat this tab already holds (e.g. came here via the table's "Lobby" link).
  const currentRoom = snapshot.roomCode && snapshot.playerToken ? snapshot.roomCode : null;

  const name = displayName.trim();
  const canCreate = !busy && name.length > 0;
  const canJoin = !busy && name.length > 0 && joinCode.length === ROOM_CODE_LENGTH;

  const enter = async (kind: 'create' | 'join') => {
    setBusy(kind);
    try {
      if (kind === 'create') await adapter.createRoom?.(name);
      else await adapter.joinRoom?.(joinCode, name);
    } finally {
      setBusy(null);
    }
    const code = adapter.getSnapshot().roomCode;
    if (code) navigate(`/rooms/${code}`);
  };

  const handleCreate = () => {
    if (canCreate) void enter('create');
  };
  const handleJoin = () => {
    if (canJoin) void enter('join');
  };

  return (
    <LobbyShell bar={<LobbyBar><RulesLink /></LobbyBar>}>
      <Hero />

      <main className="lb-tray">
        {currentRoom && (
          <div className="lb-ticket">
            <div className="lb-ticket__txt">
              <small>Your seat is waiting</small>
              <span>
                Room <strong>{currentRoom}</strong>
              </span>
            </div>
            <Link to={`/rooms/${currentRoom}`} className="lb-btn lb-btn--gold lb-btn--sm" data-testid="return-to-room">
              Return
            </Link>
          </div>
        )}

        <NameField
          value={displayName}
          onChange={setDisplayName}
          onEnter={joinCode.length === ROOM_CODE_LENGTH ? handleJoin : handleCreate}
        />

        <button
          type="button"
          className="lb-btn lb-btn--gold lb-btn--lg"
          disabled={!canCreate}
          aria-busy={busy === 'create'}
          onClick={handleCreate}
          data-testid="create-room-btn"
        >
          <span>{busy === 'create' ? 'Setting the table…' : 'Create a table'}</span>
          <small>You host · 2–5 players</small>
        </button>

        <p className="lb-or">or join friends</p>

        <div className="lb-join">
          <CodeInput value={joinCode} onChange={setJoinCode} onSubmit={handleJoin} />
          <button
            type="button"
            className="lb-btn lb-btn--paper"
            disabled={!canJoin}
            aria-busy={busy === 'join'}
            onClick={handleJoin}
            data-testid="join-room-btn"
          >
            Join
          </button>
        </div>

        {snapshot.lobbyError && (
          <p className="lb-error" role="alert" data-testid="lobby-error">
            {snapshot.lobbyError}
          </p>
        )}

        <Link to="/demo" className="lb-foot">
          <LobbyIcon name="cards" />
          <span>
            Pass &amp; play on one phone
            <small>No internet or friends needed</small>
          </span>
          <LobbyIcon name="chevron" />
        </Link>
      </main>
    </LobbyShell>
  );
}
