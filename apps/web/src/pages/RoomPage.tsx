import { Suspense, lazy, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getNetworkAdapter, setActiveAdapter, useStoreSnapshot } from '../store';
import { loadDisplayName } from '../store/session';
import { ChatSheet } from '../lobby/ChatSheet';
import { Hero } from '../lobby/Hero';
import { InviteCard, inviteUrlFor, loadQrSheet } from '../lobby/InviteCard';
import { LobbyBar, LobbyShell, RulesLink } from '../lobby/LobbyShell';
import { SeatTable } from '../lobby/SeatTable';
import { CodeTiles, NameField } from '../lobby/fields';
import { LobbyIcon } from '../lobby/icons';
import { GameView } from './GamePage';

/**
 * /rooms/:code — the one URL for a room. On mount it restores the seat stored
 * for that code (refresh, new tab, server restart) and then renders whichever
 * of three things applies: a join form (no seat here yet — an invite link), the
 * waiting room (seat held, game not started), or the table.
 */
const QrSheet = lazy(loadQrSheet);

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
    if (restoring) return <Connecting code={code} />;
    return <JoinRoomForm code={code} />;
  }

  const status = snapshot.room?.status;
  if (snapshot.clientState || status === 'playing' || status === 'finished') {
    return <GameView />;
  }
  return <WaitingRoom code={code} />;
}

function Connecting({ code }: { code: string }) {
  return (
    <LobbyShell bar={<LobbyBar />}>
      <div className="lb-loading" role="status" aria-live="polite">
        <span className="lb-spin" aria-hidden />
        Connecting to room {code}…
      </div>
    </LobbyShell>
  );
}

function JoinRoomForm({ code }: { code: string }) {
  const snapshot = useStoreSnapshot();
  const adapter = getNetworkAdapter();
  const [displayName, setDisplayName] = useState(loadDisplayName);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const name = displayName.trim();
  const handleJoin = async () => {
    if (!name || busy) return;
    setBusy(true);
    try {
      await adapter.joinRoom?.(code, name);
    } finally {
      setBusy(false);
    }
  };

  const error =
    snapshot.lobbyError && (snapshot.staleRoomCode === null || snapshot.staleRoomCode === code)
      ? snapshot.lobbyError
      : null;

  return (
    <LobbyShell bar={<LobbyBar><RulesLink /></LobbyBar>}>
      <Hero />

      <main className="lb-tray">
        <section className="lb-plaque lb-plaque--invite" aria-label="Invitation">
          <span className="lb-eyebrow">You're invited to room</span>
          <CodeTiles code={code} testId="invite-code" />
        </section>

        <NameField value={displayName} onChange={setDisplayName} onEnter={() => void handleJoin()} />

        <button
          type="button"
          className="lb-btn lb-btn--gold lb-btn--lg"
          disabled={busy || !name}
          aria-busy={busy}
          onClick={() => void handleJoin()}
          data-testid="join-room-btn"
        >
          <span>{busy ? 'Taking a seat…' : 'Take a seat'}</span>
          <small>Join the table</small>
        </button>

        <button type="button" className="lb-btn lb-btn--ghost" onClick={() => navigate('/')} data-testid="join-home-btn">
          Go to home
        </button>

        {error && (
          <p className="lb-error" role="alert" data-testid="lobby-error">
            {error}
          </p>
        )}
      </main>
    </LobbyShell>
  );
}

function WaitingRoom({ code }: { code: string }) {
  const snapshot = useStoreSnapshot();
  const adapter = getNetworkAdapter();
  const room = snapshot.room;
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // null until first opened, so the QR module is never mounted (or fetched) for players who skip it.
  const [qrOpen, setQrOpen] = useState<boolean | null>(null);
  const [seenId, setSeenId] = useState(0);

  const messages = snapshot.chatMessages;
  const lastId = messages.length > 0 ? messages[messages.length - 1]!.id : 0;
  useEffect(() => {
    if (chatOpen) setSeenId(lastId);
  }, [chatOpen, lastId]);
  const unread = chatOpen ? 0 : messages.filter((m) => m.id > seenId && m.playerId !== snapshot.playerId).length;

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

  const seats = room?.seats ?? [];
  const count = seats.length;
  const hostName = seats.find((s) => s.isHost)?.displayName ?? 'the host';
  const canStart = !busy && count >= 2;
  const canAddBot = snapshot.isHost && room?.status === 'lobby' && !busy;

  const handleAddBot = async () => {
    if (!canAddBot) return;
    setBusy(true);
    await adapter.addBot?.();
    setBusy(false);
  };

  const handleRemoveBot = async (botPlayerId: string) => {
    if (!canAddBot) return;
    setBusy(true);
    await adapter.removeBot?.(botPlayerId);
    setBusy(false);
  };

  const dock = (
    <footer className="lb-dock">
      <button type="button" className="lb-btn lb-btn--ghost" disabled={busy} onClick={() => void handleLeave()}>
        Leave room
      </button>
      {snapshot.isHost && room?.status === 'lobby' ? (
        <button
          type="button"
          className="lb-btn lb-btn--gold lb-btn--lg"
          disabled={!canStart}
          onClick={() => void handleStart()}
          data-testid="start-game-btn"
        >
          <span>Start game</span>
          <small>{count >= 2 ? `${count} players ready` : 'Need at least 2 players'}</small>
        </button>
      ) : (
        <p className="lb-wait" role="status">
          Waiting for {hostName} to start
          <span className="lb-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </p>
      )}
    </footer>
  );

  return (
    <LobbyShell
      bar={
        <LobbyBar eyebrow="Waiting room" title="Set the table">
          <button
            type="button"
            className="lb-iconbtn"
            aria-label={unread > 0 ? `Open chat, ${unread} unread` : 'Open chat'}
            onClick={() => setChatOpen(true)}
          >
            <LobbyIcon name="chat" />
            {unread > 0 && <span className="lb-badge">{unread > 9 ? '9+' : unread}</span>}
          </button>
          <RulesLink icon />
        </LobbyBar>
      }
      dock={dock}
      overlay={
        <>
          <ChatSheet open={chatOpen} onClose={() => setChatOpen(false)} />
          {qrOpen !== null && (
            <Suspense fallback={null}>
              <QrSheet open={qrOpen} url={inviteUrlFor(code)} code={code} onClose={() => setQrOpen(false)} />
            </Suspense>
          )}
        </>
      }
    >
      <main className="lb-room">
        <InviteCard code={code} seats={seats} viewerId={snapshot.playerId} onShowQr={() => setQrOpen(true)} />
        <SeatTable
          seats={seats}
          viewerId={snapshot.playerId}
          onAddBot={canAddBot ? () => void handleAddBot() : undefined}
          onRemoveBot={canAddBot ? (id) => void handleRemoveBot(id) : undefined}
        />

        {snapshot.sseStatus === 'error' && (
          <p className="lb-conn" role="status">
            Connection lost — retrying…
          </p>
        )}
        {snapshot.lobbyError && (
          <p className="lb-error" role="alert" data-testid="lobby-error">
            {snapshot.lobbyError}
          </p>
        )}
      </main>
    </LobbyShell>
  );
}
