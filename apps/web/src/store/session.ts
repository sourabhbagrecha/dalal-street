/**
 * Per-room seat credentials, keyed by room code so a room URL (/rooms/:code) can
 * find its own seat again. Written to both sessionStorage (this tab — refresh,
 * back/forward) and localStorage (a new tab or a later visit to the same link);
 * read tab-first so two tabs in one browser can still sit in different rooms.
 */
export interface RoomSession {
  playerToken: string;
  playerId: string;
  isHost: boolean;
}

const PREFIX = 'md_session:';
const DISPLAY_NAME_KEY = 'md_displayName';

function keyFor(code: string): string {
  return `${PREFIX}${code.toUpperCase()}`;
}

function read(storage: Storage, key: string): RoomSession | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RoomSession>;
    if (typeof parsed.playerToken !== 'string' || typeof parsed.playerId !== 'string') return null;
    return {
      playerToken: parsed.playerToken,
      playerId: parsed.playerId,
      isHost: parsed.isHost === true,
    };
  } catch {
    return null;
  }
}

/**
 * Pre-URL layout: one flat set of keys for "the" room of this tab. Still honoured
 * (read-only) so the dev fixture tooling that seeds a seat this way keeps working.
 */
const LEGACY = {
  roomCode: 'md_roomCode',
  token: 'md_playerToken',
  playerId: 'md_playerId',
  isHost: 'md_isHost',
} as const;

export function loadLegacyRoomCode(): string | null {
  try {
    return sessionStorage.getItem(LEGACY.roomCode);
  } catch {
    return null;
  }
}

function readLegacy(code: string): RoomSession | null {
  try {
    if (sessionStorage.getItem(LEGACY.roomCode)?.toUpperCase() !== code.toUpperCase()) return null;
    const playerToken = sessionStorage.getItem(LEGACY.token);
    const playerId = sessionStorage.getItem(LEGACY.playerId);
    if (!playerToken || !playerId) return null;
    return { playerToken, playerId, isHost: sessionStorage.getItem(LEGACY.isHost) === 'true' };
  } catch {
    return null;
  }
}

export function loadRoomSession(code: string): RoomSession | null {
  const key = keyFor(code);
  return read(sessionStorage, key) ?? read(localStorage, key) ?? readLegacy(code);
}

export function saveRoomSession(code: string, session: RoomSession): void {
  const key = keyFor(code);
  const raw = JSON.stringify(session);
  try {
    sessionStorage.setItem(key, raw);
    localStorage.setItem(key, raw);
  } catch {
    // storage full or blocked — the in-memory snapshot still carries the session
  }
}

export function clearRoomSession(code: string): void {
  const key = keyFor(code);
  try {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
    sessionStorage.removeItem(`${SEQ_PREFIX}${code.toUpperCase()}`);
    localStorage.removeItem(`${SEQ_PREFIX}${code.toUpperCase()}`);
    if (sessionStorage.getItem(LEGACY.roomCode)?.toUpperCase() === code.toUpperCase()) {
      for (const legacyKey of Object.values(LEGACY)) sessionStorage.removeItem(legacyKey);
    }
  } catch {
    // ignore
  }
}

/**
 * The next command sequence number for a seat. The server rejects any seq at or
 * below the highest it has applied for that seat (and answers a replayed seq
 * with a silent `duplicate` ack), so a page reload that restarts counting at 0
 * would have every command — including the auto-draw — swallowed until the
 * counter climbed past what the previous page had sent. Persisted per room so
 * a reload, a new tab or a later visit keeps counting from where it left off.
 */
const SEQ_PREFIX = 'md_seq:';

export function loadCommandSeq(code: string): number {
  const key = `${SEQ_PREFIX}${code.toUpperCase()}`;
  try {
    const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key);
    const n = raw === null ? NaN : Number(raw);
    return Number.isSafeInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function saveCommandSeq(code: string, next: number): void {
  const key = `${SEQ_PREFIX}${code.toUpperCase()}`;
  try {
    sessionStorage.setItem(key, String(next));
    localStorage.setItem(key, String(next));
  } catch {
    // ignore
  }
}

export function loadDisplayName(): string {
  try {
    return localStorage.getItem(DISPLAY_NAME_KEY) ?? sessionStorage.getItem(DISPLAY_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveDisplayName(name: string): void {
  try {
    localStorage.setItem(DISPLAY_NAME_KEY, name);
  } catch {
    // ignore
  }
}
