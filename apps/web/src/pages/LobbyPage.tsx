import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChatPanel } from '../components/ChatPanel';
import {
  getNetworkAdapter,
  setActiveAdapter,
  useStoreSnapshot,
} from '../store';
import type { RejoinHint } from '../store/types';

const DISPLAY_NAME_MAX = 24;
const DISPLAY_NAME_WARN_AT = 18;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 5;

function statusLabel(status: string | undefined): string {
  switch (status) {
    case 'lobby':
      return 'Waiting for players';
    case 'playing':
      return 'Game in progress';
    default:
      return 'Connecting…';
  }
}

function pluralize(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

export function LobbyPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(
    () => sessionStorage.getItem('md_displayName') ?? '',
  );
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const codeValueRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setActiveAdapter(getNetworkAdapter());
    getNetworkAdapter().reconnect?.();
  }, []);

  const snapshot = useStoreSnapshot();
  const adapter = getNetworkAdapter();
  const room = snapshot.room;
  const inRoom = Boolean(snapshot.roomCode && snapshot.playerToken);

  // FIX 3 / E2: the live session token lives only in this tab's
  // `sessionStorage` (see `networkAdapter.ts`'s `SESSION_KEYS`), so losing
  // the tab (an OS reclaim, a crash) loses it for good even though the
  // server keeps a disconnected seat reclaimable for 60s.
  // `adapter.getResumableHint()` reads a separate `localStorage` breadcrumb
  // — room code, seat, display name, last-known token — written on every
  // successful create/join and kept fresh by every `roomUpdate` this tab has
  // seen. It is never loaded into the live session automatically; only the
  // explicit tap below does that, via `adapter.resumeGame()`, which re-runs
  // the same `join` flow a stranger would use (the server's own
  // `Room.join()` reclaims the seat by display name when it's still
  // disconnected and inside its grace window — see
  // `apps/server/src/rejoin.test.ts`).
  const [resumeHint, setResumeHint] = useState<RejoinHint | null>(
    () => adapter.getResumableHint?.() ?? null,
  );
  const [resumeFailedMessage, setResumeFailedMessage] = useState<string | null>(null);

  const handleResume = async () => {
    setResumeFailedMessage(null);
    setBusy(true);
    const result = await adapter.resumeGame?.();
    setBusy(false);
    if (result && !result.ok) {
      setResumeHint(null);
      setResumeFailedMessage(
        result.reason ?? "That seat couldn't be recovered.",
      );
      // The adapter also records this on `lobbyError` as a fallback for
      // anything not going through this dedicated flow — clear it here so
      // the generic banner at the bottom of the page doesn't repeat it.
      adapter.clearLobbyError?.();
    }
  };

  useEffect(() => {
    if (snapshot.clientState) {
      navigate('/game', { replace: true });
      return;
    }
    if (room?.status === 'playing' && snapshot.roomCode) {
      navigate('/game', { replace: true });
    }
  }, [room?.status, snapshot.clientState, snapshot.roomCode, navigate]);

  // Reset the "Copied!" confirmation a couple seconds after it appears.
  useEffect(() => {
    if (copyState === 'idle') return;
    const t = window.setTimeout(() => setCopyState('idle'), 2500);
    return () => window.clearTimeout(t);
  }, [copyState]);

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

  const handleCopyCode = async () => {
    const code = snapshot.roomCode;
    if (!code) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(code);
      setCopyState('copied');
    } catch {
      // Clipboard API missing or the write was rejected (permissions, insecure
      // context, etc.) — fall back to selecting the code so the player can
      // copy it with their device's own copy gesture.
      const el = codeValueRef.current;
      const selection = window.getSelection();
      if (el && selection) {
        const range = document.createRange();
        range.selectNodeContents(el);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setCopyState('failed');
    }
  };

  const clearStaleError = () => {
    if (snapshot.lobbyError) adapter.clearLobbyError?.();
  };

  const seatCount = room?.seats.length ?? 0;
  const seatsNeeded = Math.max(0, MIN_PLAYERS - seatCount);

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

      {!inRoom && (
        <div className="lobby__hero">
          <img src="/artwork-hero.svg" alt="" aria-hidden="true" className="lobby__hero-art" />
          <p className="lobby__tagline">
            Wheel, deal, and hustle your way across India&rsquo;s biggest cities.
          </p>
          <Link
            to="/local"
            className="prompt-btn prompt-btn--primary lobby__play-local-btn"
            data-testid="play-local-btn"
          >
            Pass &amp; play (local)
          </Link>
        </div>
      )}

      {!inRoom && resumeHint && (
        <div className="lobby__card" data-testid="resume-card">
          <span className="lobby__card-eyebrow">Game in progress</span>
          <p>
            Resume your game in room <strong>{resumeHint.roomCode}</strong> as{' '}
            {resumeHint.displayName}?
          </p>
          <div className="lobby__actions">
            <button
              type="button"
              className="prompt-btn prompt-btn--primary"
              disabled={busy}
              onClick={() => void handleResume()}
              data-testid="resume-game-btn"
            >
              Resume game
            </button>
          </div>
        </div>
      )}

      {!inRoom && resumeFailedMessage && (
        <p className="lobby__error" role="alert" data-testid="resume-failed">
          {resumeFailedMessage}
        </p>
      )}

      <div className="lobby__card">
        {!inRoom && <span className="lobby__card-eyebrow">Play online</span>}

        <label className="lobby__field">
          <span className="lobby__field-label-row">
            <span>Display name</span>
            {displayName.length >= DISPLAY_NAME_WARN_AT && (
              <span
                className={`lobby__char-count${
                  displayName.length >= DISPLAY_NAME_MAX ? ' lobby__char-count--limit' : ''
                }`}
              >
                {displayName.length}/{DISPLAY_NAME_MAX}
              </span>
            )}
          </span>
          <input
            type="text"
            maxLength={DISPLAY_NAME_MAX}
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              clearStaleError();
            }}
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
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase());
                  clearStaleError();
                }}
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
            <div className="lobby__code-row">
              <button
                type="button"
                className="lobby__code"
                onClick={() => void handleCopyCode()}
                data-testid="room-code-copy"
                aria-label={`Room code ${snapshot.roomCode}. Tap to copy.`}
              >
                <span className="lobby__code-label">Room code</span>
                <span className="lobby__code-value" ref={codeValueRef} data-testid="room-code">
                  {snapshot.roomCode}
                </span>
              </button>
              <button
                type="button"
                className="lobby__copy-btn"
                onClick={() => void handleCopyCode()}
                data-testid="room-code-copy-btn"
                aria-label="Copy room code"
              >
                {copyState === 'copied' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {copyState !== 'idle' && (
              <p className="lobby__copy-confirm" role="status" data-testid="copy-confirm">
                {copyState === 'copied'
                  ? 'Room code copied to clipboard.'
                  : "Couldn't copy automatically — code selected, use your device's copy."}
              </p>
            )}

            <p className="lobby__status">
              {statusLabel(room?.status)}
              {snapshot.sseStatus === 'error' && (
                <span className="lobby__error"> — connection lost</span>
              )}
            </p>

            {room?.status === 'lobby' && (
              <p className="lobby__seat-count">
                {pluralize(seatCount, 'player')} seated &middot; {MIN_PLAYERS}&ndash;{MAX_PLAYERS}{' '}
                needed to play
              </p>
            )}

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
              {room?.status === 'lobby' &&
                Array.from({ length: seatsNeeded }).map((_, i) => (
                  <li key={`empty-seat-${i}`} className="lobby__seat lobby__seat--empty">
                    <span className="lobby__seat-pulse" aria-hidden="true" />
                    <span className="lobby__seat-name lobby__seat-name--empty">
                      Waiting for player&hellip;
                    </span>
                  </li>
                ))}
            </ul>

            {snapshot.isHost && room?.status === 'lobby' && (
              <button
                type="button"
                className="prompt-btn prompt-btn--primary"
                disabled={busy || seatCount < MIN_PLAYERS}
                onClick={() => void handleStart()}
                data-testid="start-game-btn"
              >
                {seatCount < MIN_PLAYERS
                  ? seatsNeeded === 1
                    ? 'Waiting for one more player'
                    : `Waiting for ${seatsNeeded} more players`
                  : `Start game (${pluralize(seatCount, 'player')})`}
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
