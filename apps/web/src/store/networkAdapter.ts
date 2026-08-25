import {
  PROTOCOL_VERSION,
  type ClientGameState,
  type CommandAck,
  type GameEvent,
  type PropertySet,
  type SseEvent,
  type WireCommandType,
} from '@monopoly-deal/shared';
import type { Card } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import type { GameStoreApi, RejoinHint, StoreSnapshot, StealableOption } from './types';
import { SESSION_KEYS } from './types';
import { appendSingleLog } from './logUtils';
import { deriveNoticesForEvent, pushNotice } from './notices';
import { removalCost, wastedDiscardPlay } from '@monopoly-deal/engine';
import { resolveWildPlayColor } from '../wildFaceStore';
import { theme } from '../theme';

type Listener = () => void;

function emptySnapshot(): StoreSnapshot {
  return {
    clientState: null,
    log: [],
    chatMessages: [],
    rejected: null,
    notices: [],
    mode: 'network',
    localSeatIndex: 0,
    room: null,
    isHost: false,
    roomCode: null,
    playerToken: null,
    playerId: null,
    lobbyError: null,
    sseStatus: 'idle',
  };
}

// ── Rejoin hints (FIX 3 / E2) ────────────────────────────────────────────
//
// The live session token lives only in per-tab `sessionStorage` (see
// `loadSession`/`saveSession` below) — that's deliberate, so two tabs of one
// browser can sit at two different seats. But it also means an OS tab
// reclaim (or a crash) loses the token permanently with no way back, even
// though the server keeps a disconnected seat reclaimable for 60s (see
// `Room.join()` in `apps/server/src/room.ts` and its tests in
// `rejoin.test.ts`). This is a *hint*, not the live session: a breadcrumb in
// `localStorage` (shared across tabs, survives a closed tab) that lets the
// lobby screen offer an explicit "resume" affordance. Nothing here loads a
// token into a live session automatically — only a deliberate tap does that.
const REJOIN_HINTS_KEY = 'md.rejoinHints.v1';

function loadRejoinHints(): Record<string, RejoinHint> {
  try {
    const raw = localStorage.getItem(REJOIN_HINTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, RejoinHint>) : {};
  } catch {
    // Safari private mode (and friends) throw on storage access — resume
    // just won't be offered, which is a safe degradation.
    return {};
  }
}

function saveRejoinHint(hint: RejoinHint): void {
  try {
    const all = loadRejoinHints();
    all[hint.roomCode] = hint;
    localStorage.setItem(REJOIN_HINTS_KEY, JSON.stringify(all));
  } catch {
    // ignore — see loadRejoinHints
  }
}

/** Called on an explicit "Leave room" and after a resume attempt the server honestly refused — either way the hint would be misleading to keep around. */
function clearRejoinHintForRoom(roomCode: string): void {
  try {
    const all = loadRejoinHints();
    delete all[roomCode];
    localStorage.setItem(REJOIN_HINTS_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

/**
 * The most recently-updated hint for a room this tab last saw as actually
 * `playing` — the only state `Room.join()` can reclaim a seat for (a still-
 * `lobby` room would just hand the resuming display name a brand new seat
 * instead of their old one, since `join()` only reclaims once the game has
 * started). Since there is no unauthenticated "what's this room's status
 * right now" endpoint, this is necessarily based on what the tab last knew
 * before it was lost — a real but bounded limitation, noted in the report.
 */
function latestResumableRejoinHint(): RejoinHint | null {
  const resumable = Object.values(loadRejoinHints()).filter((h) => h.status === 'playing');
  if (resumable.length === 0) return null;
  return resumable.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
}

function loadSession(): Pick<StoreSnapshot, 'roomCode' | 'playerToken' | 'playerId' | 'isHost'> {
  return {
    roomCode: sessionStorage.getItem(SESSION_KEYS.roomCode),
    playerToken: sessionStorage.getItem(SESSION_KEYS.token),
    playerId: sessionStorage.getItem(SESSION_KEYS.playerId),
    isHost: sessionStorage.getItem(SESSION_KEYS.isHost) === 'true',
  };
}

function saveSession(data: {
  roomCode: string;
  playerToken: string;
  playerId: string;
  isHost: boolean;
  displayName?: string;
}) {
  sessionStorage.setItem(SESSION_KEYS.roomCode, data.roomCode);
  sessionStorage.setItem(SESSION_KEYS.token, data.playerToken);
  sessionStorage.setItem(SESSION_KEYS.playerId, data.playerId);
  sessionStorage.setItem(SESSION_KEYS.isHost, String(data.isHost));
  if (data.displayName) sessionStorage.setItem(SESSION_KEYS.displayName, data.displayName);
}

function clearSession() {
  for (const key of Object.values(SESSION_KEYS)) {
    sessionStorage.removeItem(key);
  }
}

function cardValue(card: Card): number {
  return card.value;
}

function isCompleteSetHeuristic(set: PropertySet): boolean {
  return set.cards.length >= SET_SIZES[set.color];
}

function stealableFromBoard(board: import('@monopoly-deal/shared').PlayerBoard): StealableOption[] {
  const out: StealableOption[] = [];
  for (const set of board.sets) {
    if (set.cards.length === 0) continue;
    if (isCompleteSetHeuristic(set) && set.house) continue;
    if (isCompleteSetHeuristic(set) && set.hotel) continue;
    for (const card of set.cards) {
      if (card.kind === 'property_wild' && card.colors.length > 1 && !card.assignedColor) continue;
      out.push({ card });
    }
  }
  return out;
}

export function createNetworkAdapter(): GameStoreApi {
  let snapshot: StoreSnapshot = { ...emptySnapshot(), ...loadSession() };
  const listeners = new Set<Listener>();
  let eventSource: EventSource | null = null;
  let commandSeq = 0;
  let logSeq = 0;

  // Set right before a `SELECT_PAYMENT` command this tab's own player just
  // submitted goes out — see `send()` below. Lets the `payment_made` notice
  // derivation (FIX 1 / E4) tell "I just paid this myself" apart from "the
  // server auto-paid on my behalf after my window expired", which the event
  // itself carries no flag for.
  let recentSelfPayment: { playerId: string; until: number } | null = null;
  const SELF_PAYMENT_WINDOW_MS = 5000;

  const notify = () => {
    for (const l of listeners) l();
  };

  const setSnapshot = (partial: Partial<StoreSnapshot>) => {
    snapshot = { ...snapshot, ...partial };
    notify();
  };

  const handleSseEvent = (raw: SseEvent) => {
    switch (raw.type) {
      case 'projection': {
        const state = raw.state as ClientGameState;
        setSnapshot({ clientState: state, sseStatus: 'connected' });
        break;
      }
      case 'event': {
        const event = raw.event as GameEvent;
        const appended = appendSingleLog(snapshot.log, event, logSeq);
        logSeq = appended.seq;

        let notices = snapshot.notices ?? [];
        // A tab only ever has one fixed viewer for its whole lifetime, so
        // the only recipient whose view this tab can (or ever needs to)
        // produce is itself — any notice addressed to someone else would
        // never be shown here anyway (see `Toast.tsx`'s per-viewer filter).
        const stateForPlayer = (playerId: string): ClientGameState | null =>
          playerId === snapshot.clientState?.viewerId ? snapshot.clientState : null;
        {
          let selfInitiatedPayment = false;
          if (
            event.type === 'payment_made' &&
            recentSelfPayment &&
            recentSelfPayment.playerId === event.playerId &&
            Date.now() <= recentSelfPayment.until
          ) {
            selfInitiatedPayment = true;
            recentSelfPayment = null;
          }
          for (const input of deriveNoticesForEvent(stateForPlayer, theme.formatMoney, event, {
            selfInitiatedPayment,
          })) {
            notices = pushNotice(notices, input);
          }
        }

        setSnapshot({ log: appended.log, notices });
        break;
      }
      case 'roomUpdate': {
        setSnapshot({ room: raw.room });
        // Keep the resume hint's last-known status fresh while this tab is
        // actually connected — see `latestResumableRejoinHint`.
        if (snapshot.roomCode && snapshot.playerToken && snapshot.playerId) {
          saveRejoinHint({
            roomCode: snapshot.roomCode,
            playerId: snapshot.playerId,
            displayName: sessionStorage.getItem(SESSION_KEYS.displayName) ?? '',
            playerToken: snapshot.playerToken,
            status: raw.room.status,
            updatedAt: Date.now(),
          });
        }
        break;
      }
      case 'chat': {
        if (snapshot.chatMessages.some((m) => m.id === raw.message.id)) break;
        setSnapshot({ chatMessages: [...snapshot.chatMessages, raw.message] });
        break;
      }
      case 'error':
        setSnapshot({ lobbyError: raw.reason, rejected: raw.reason });
        break;
    }
  };

  const connectSse = () => {
    const { roomCode, playerToken } = snapshot;
    if (!roomCode || !playerToken) return;

    eventSource?.close();
    setSnapshot({ sseStatus: 'connecting' });

    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
    const url = `${apiBase}/rooms/${encodeURIComponent(roomCode)}/events?token=${encodeURIComponent(playerToken)}`;
    const es = new EventSource(url);
    eventSource = es;

    es.onopen = () => setSnapshot({ sseStatus: 'connected', lobbyError: null });
    es.onerror = () => {
      setSnapshot({ sseStatus: 'error' });
      // EventSource reconnects automatically; give it a moment then force a clean reconnect.
      window.setTimeout(() => {
        if (eventSource === es && es.readyState === EventSource.CLOSED) {
          connectSse();
        }
      }, 1500);
    };

    for (const type of ['projection', 'event', 'roomUpdate', 'error', 'chat'] as const) {
      es.addEventListener(type, (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as SseEvent;
          handleSseEvent(data);
        } catch {
          // ignore malformed SSE payloads
        }
      });
    }
  };

  const postJson = async <T>(path: string, body: unknown): Promise<T & { ok: boolean; reason?: string; code?: string }> => {
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
    const res = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json() as Promise<T & { ok: boolean; reason?: string; code?: string }>;
  };

  const postCommand = async (
    type: WireCommandType,
    payload: Record<string, unknown> = {},
  ): Promise<{ ok: boolean; reason?: string }> => {
    const { roomCode, playerToken } = snapshot;
    if (!roomCode || !playerToken) return { ok: false, reason: 'Not in a room' };

    const seq = commandSeq++;
    const ack = await postJson<CommandAck>(`/rooms/${encodeURIComponent(roomCode)}/commands`, {
      v: PROTOCOL_VERSION,
      playerToken,
      seq,
      type,
      payload,
    });

    if (!ack.ok) {
      setSnapshot({ rejected: ack.reason });
      return { ok: false, reason: ack.reason };
    }
    setSnapshot({ rejected: null });
    return { ok: true };
  };

  const api: GameStoreApi = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async dispatchCommand(type, payload = {}) {
      return postCommand(type as WireCommandType, payload);
    },

    draw() {
      void postCommand('DRAW_TURN_CARDS');
    },

    endTurn() {
      void postCommand('END_TURN');
    },

    playCard(cardId, zone, target) {
      void postCommand('PLAY_CARD', { cardId, zone, target });
    },

    send(command) {
      if (command.type === 'SELECT_PAYMENT' && command.playerId) {
        recentSelfPayment = { playerId: command.playerId, until: Date.now() + SELF_PAYMENT_WINDOW_MS };
      }
      const { type, ...rest } = command;
      const payload = { ...rest };
      delete (payload as { playerId?: string }).playerId;
      void postCommand(type as WireCommandType, payload as Record<string, unknown>);
    },

    rejectLocal(message) {
      setSnapshot({ rejected: message });
    },

    clearRejected() {
      setSnapshot({ rejected: null });
    },

    dismissNotice(id) {
      setSnapshot({ notices: (snapshot.notices ?? []).filter((n) => n.id !== id) });
    },

    getResumableHint() {
      return latestResumableRejoinHint();
    },

    async resumeGame() {
      const hint = latestResumableRejoinHint();
      if (!hint) return { ok: false, reason: 'Nothing to resume' };
      // Reuses the exact same server round-trip a stranger's join takes —
      // `Room.join()` reclaims a still-disconnected, still-in-grace seat by
      // display name (see `rejoin.test.ts`) — so success here already saved
      // the session and connected SSE by the time this resolves.
      await api.joinRoom?.(hint.roomCode, hint.displayName);
      if (snapshot.lobbyError) {
        clearRejoinHintForRoom(hint.roomCode);
        const reason =
          "That seat couldn't be recovered — the reconnect window may have closed, or someone else has already taken it.";
        setSnapshot({ lobbyError: reason });
        return { ok: false, reason };
      }
      return { ok: true };
    },

    getLegalPlayZones(_cardId) {
      const state = snapshot.clientState;
      if (!state) return [];
      if (state.currentPlayerId !== state.viewerId) return [];
      const top = state.pendingStack[state.pendingStack.length - 1];
      if (top?.kind === 'hand_limit_discard' && top.playerId === state.viewerId) {
        return ['discard'];
      }
      if (state.turnPhase === 'awaiting_draw') return [];
      return ['bank', 'property', 'discard'];
    },

    canDraw() {
      const state = snapshot.clientState;
      if (!state) return false;
      return (
        state.currentPlayerId === state.viewerId &&
        state.turnPhase === 'awaiting_draw' &&
        !state.drawnThisTurn
      );
    },

    canEndTurn() {
      const state = snapshot.clientState;
      if (!state) return false;
      return state.currentPlayerId === state.viewerId && state.turnPhase !== 'awaiting_draw';
    },

    pickPlayCommand(cardId, zone, target) {
      if (!target && zone === 'property') {
        const state = snapshot.clientState;
        const card = state?.you.hand.find((c) => c.id === cardId);
        if (card && card.kind === 'property_wild') {
          const color = resolveWildPlayColor(card, state!.you.board.sets);
          if (color) target = { assignedColor: color };
        }
      }
      return { cardId, zone, target };
    },

    validatePayment(payerId, amountDue, cardIds) {
      const state = snapshot.clientState;
      if (!state) return false;
      const payer =
        payerId === state.viewerId
          ? state.you
          : state.players.find((p) => p.id === payerId);
      if (!payer) return false;

      let total = 0;
      for (const id of cardIds) {
        for (const c of payer.board.bank) {
          if (c.id === id) total += cardValue(c);
        }
        for (const set of payer.board.sets) {
          for (const c of set.cards) {
            if (c.id === id) total += cardValue(c);
          }
          if (set.house?.id === id) total += cardValue(set.house);
          if (set.hotel?.id === id) total += cardValue(set.hotel);
        }
        if (payerId === state.viewerId) {
          for (const c of state.you.hand) {
            if (c.id === id) total += cardValue(c);
          }
        }
      }
      return total >= amountDue;
    },

    stealableProperties(actorId, selfOnly) {
      const state = snapshot.clientState;
      if (!state) return [];
      const boardFor = (id: string) => {
        if (id === state.viewerId) return state.you.board;
        return state.players.find((p) => p.id === id)?.board;
      };
      if (selfOnly) {
        const board = boardFor(actorId);
        return board ? stealableFromBoard(board) : [];
      }
      const out: StealableOption[] = [];
      const all = [state.you, ...state.players.filter((p) => p.id !== state.viewerId)];
      for (const p of all.filter((pl) => pl.id !== actorId)) {
        out.push(...stealableFromBoard(p.board));
      }
      return out;
    },

    removalCost(cardId) {
      const board = snapshot.clientState?.you.board;
      return board ? removalCost(board, cardId) : null;
    },

    wastedDiscardPlay(cardId) {
      const state = snapshot.clientState;
      return state ? wastedDiscardPlay(state, cardId) : null;
    },

    isCompleteSet(set) {
      return isCompleteSetHeuristic(set);
    },

    async createRoom(displayName) {
      setSnapshot({ lobbyError: null });
      const res = await postJson<{
        ok: true;
        roomCode: string;
        playerToken: string;
        playerId: string;
        isHost: boolean;
      }>('/rooms', { v: PROTOCOL_VERSION, displayName });

      if (!res.ok) {
        setSnapshot({ lobbyError: res.reason ?? 'Failed to create room' });
        return;
      }

      saveSession({
        roomCode: res.roomCode,
        playerToken: res.playerToken,
        playerId: res.playerId,
        isHost: res.isHost,
        displayName,
      });
      saveRejoinHint({
        roomCode: res.roomCode,
        playerId: res.playerId,
        displayName,
        playerToken: res.playerToken,
        status: 'lobby',
        updatedAt: Date.now(),
      });
      setSnapshot({
        roomCode: res.roomCode,
        playerToken: res.playerToken,
        playerId: res.playerId,
        isHost: res.isHost,
        lobbyError: null,
      });
      connectSse();
    },

    async joinRoom(code, displayName) {
      setSnapshot({ lobbyError: null });
      const normalized = code.trim().toUpperCase();
      const res = await postJson<{
        ok: true;
        roomCode: string;
        playerToken: string;
        playerId: string;
        isHost: boolean;
      }>(`/rooms/${encodeURIComponent(normalized)}/join`, {
        v: PROTOCOL_VERSION,
        displayName,
      });

      if (!res.ok) {
        const msg =
          res.code === 'room_full'
            ? 'Room is full'
            : res.code === 'game_started'
              ? 'Game already started'
              : res.code === 'not_found'
                ? 'Room not found'
                : (res.reason ?? 'Failed to join room');
        setSnapshot({ lobbyError: msg });
        return;
      }

      saveSession({
        roomCode: res.roomCode,
        playerToken: res.playerToken,
        playerId: res.playerId,
        isHost: res.isHost,
        displayName,
      });
      saveRejoinHint({
        roomCode: res.roomCode,
        playerId: res.playerId,
        displayName,
        playerToken: res.playerToken,
        // A join that lands on a still-`lobby` room got a brand new seat, not
        // a reclaim; a join that succeeded against a running room (the
        // `Room.join()` reclaim path) means this really was a resume — either
        // way the next `roomUpdate` (sent immediately on connect) refreshes
        // this to the real status within moments.
        status: 'lobby',
        updatedAt: Date.now(),
      });
      setSnapshot({
        roomCode: res.roomCode,
        playerToken: res.playerToken,
        playerId: res.playerId,
        isHost: res.isHost,
        lobbyError: null,
      });
      connectSse();
    },

    async startGame() {
      const { roomCode, playerToken } = snapshot;
      if (!roomCode || !playerToken) return;
      const res = await postJson<{ ok: boolean; reason?: string }>(
        `/rooms/${encodeURIComponent(roomCode)}/start`,
        { v: PROTOCOL_VERSION, playerToken },
      );
      if (!res.ok) {
        setSnapshot({ lobbyError: res.reason ?? 'Failed to start game' });
      }
    },

    async leaveRoom() {
      const { roomCode, playerToken } = snapshot;
      if (roomCode && playerToken) {
        await postJson(`/rooms/${encodeURIComponent(roomCode)}/leave`, {
          v: PROTOCOL_VERSION,
          playerToken,
        });
      }
      if (roomCode) clearRejoinHintForRoom(roomCode);
      eventSource?.close();
      eventSource = null;
      clearSession();
      snapshot = emptySnapshot();
      notify();
    },

    reconnect() {
      const session = loadSession();
      if (session.roomCode && session.playerToken) {
        setSnapshot({ ...session, sseStatus: 'idle' });
        connectSse();
      }
    },

    clearLobbyError() {
      setSnapshot({ lobbyError: null });
    },

    async sendChat(text) {
      const trimmed = text.trim();
      if (!trimmed) return { ok: false, reason: 'Empty message' };

      const { roomCode, playerToken } = snapshot;
      if (!roomCode || !playerToken) return { ok: false, reason: 'Not in a room' };

      const res = await postJson<{ ok: boolean; reason?: string }>(
        `/rooms/${encodeURIComponent(roomCode)}/chat`,
        { v: PROTOCOL_VERSION, playerToken, text: trimmed },
      );
      if (!res.ok) {
        return { ok: false, reason: res.reason ?? 'Failed to send message' };
      }
      return { ok: true };
    },
  };

  if (snapshot.roomCode && snapshot.playerToken) {
    connectSse();
  }

  if (typeof window !== 'undefined') {
    (
      window as unknown as {
        __MD_TEST__?: { getSnapshot: () => StoreSnapshot };
      }
    ).__MD_TEST__ = {
      getSnapshot: () => snapshot,
    };
  }

  return api;
}
