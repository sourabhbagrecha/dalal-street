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
import type { GameStoreApi, StoreSnapshot, StealableOption } from './types';
import { SESSION_KEYS } from './types';
import { appendSingleLog } from './logUtils';

type Listener = () => void;

function emptySnapshot(): StoreSnapshot {
  return {
    clientState: null,
    log: [],
    chatMessages: [],
    rejected: null,
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
        const appended = appendSingleLog(snapshot.log, raw.event as GameEvent, logSeq);
        logSeq = appended.seq;
        setSnapshot({ log: appended.log });
        break;
      }
      case 'roomUpdate':
        setSnapshot({ room: raw.room });
        break;
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
