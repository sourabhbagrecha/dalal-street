import {
  PROTOCOL_VERSION,
  type ClientGameState,
  type CommandAck,
  type GameEvent,
  type PropertySet,
  type RoomView,
  type SseEvent,
  type WireCommandType,
} from '@monopoly-deal/shared';
import type { Card } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import type { GameStoreApi, StoreSnapshot, StealableOption } from './types';
import { appendSingleLog } from './logUtils';
import {
  clearRoomSession,
  loadCommandSeq,
  loadRoomSession,
  saveCommandSeq,
  saveDisplayName,
  saveRoomSession,
} from './session';
import { removalCost, wastedDiscardPlay } from '@monopoly-deal/engine';
import { resolveWildPlayColor } from '../wildFaceStore';

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
    staleRoomCode: null,
  };
}

const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

interface RoomInfo {
  ok: boolean;
  code?: string;
  room?: RoomView;
  seat?: { playerId: string; isHost: boolean } | null;
}

/**
 * Ask the server whether `code` still exists and whether `token` still holds a
 * seat there. Resolves 'unreachable' on a network failure so callers keep
 * retrying rather than throwing the stored seat away.
 */
async function probeRoom(
  code: string,
  token: string | null,
): Promise<{ kind: 'ok'; info: RoomInfo } | { kind: 'gone' } | { kind: 'unreachable' }> {
  try {
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    const res = await fetch(`${apiBase}/rooms/${encodeURIComponent(code)}${query}`);
    if (res.status === 404) return { kind: 'gone' };
    if (!res.ok) return { kind: 'unreachable' };
    const info = (await res.json()) as RoomInfo;
    return info.ok ? { kind: 'ok', info } : { kind: 'gone' };
  } catch {
    return { kind: 'unreachable' };
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
  let snapshot: StoreSnapshot = emptySnapshot();
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

    const url = `${apiBase}/rooms/${encodeURIComponent(roomCode)}/events?token=${encodeURIComponent(playerToken)}`;
    const es = new EventSource(url);
    eventSource = es;

    es.onopen = () => setSnapshot({ sseStatus: 'connected', lobbyError: null });
    es.onerror = () => {
      setSnapshot({ sseStatus: 'error' });
      // EventSource reconnects automatically; give it a moment then force a clean
      // reconnect — unless the server says the room (or this seat) is gone, in
      // which case retrying forever would only hide that from the player.
      window.setTimeout(() => {
        if (eventSource !== es || es.readyState !== EventSource.CLOSED) return;
        void probeRoom(roomCode, playerToken).then((probe) => {
          if (eventSource !== es) return;
          if (probe.kind === 'gone' || (probe.kind === 'ok' && !probe.info.seat)) {
            dropRoom(roomCode, 'This room is no longer available.');
            return;
          }
          connectSse();
        });
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

  /** Forget `code`'s seat: stored credentials, live stream and snapshot. */
  const dropRoom = (code: string, message: string | null) => {
    eventSource?.close();
    eventSource = null;
    clearRoomSession(code);
    snapshot = {
      ...emptySnapshot(),
      lobbyError: message,
      staleRoomCode: message ? code : null,
    };
    notify();
  };

  const postJson = async <T>(path: string, body: unknown): Promise<T & { ok: boolean; reason?: string; code?: string }> => {
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
    saveCommandSeq(roomCode, commandSeq);
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

  /** A seat was just granted — remember it and start streaming. */
  const enterRoom = (
    res: { roomCode: string; playerToken: string; playerId: string; isHost: boolean },
    displayName: string,
  ) => {
    saveDisplayName(displayName);
    saveRoomSession(res.roomCode, {
      playerToken: res.playerToken,
      playerId: res.playerId,
      isHost: res.isHost,
    });
    eventSource?.close();
    eventSource = null;
    commandSeq = 0;
    snapshot = {
      ...emptySnapshot(),
      roomCode: res.roomCode,
      playerToken: res.playerToken,
      playerId: res.playerId,
      isHost: res.isHost,
    };
    notify();
    connectSse();
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
      if (total >= amountDue) return true;

      // Can't fully cover amountDue — the only legal selection is everything
      // payable (bank + property cards), mirroring
      // packages/engine/src/validators.ts's isValidPaymentSelection. Hand
      // cards are excluded from this "everything" total: PaymentPrompt never
      // offers them as payable, so requiring them here would make the
      // confirm button permanently unreachable for a payer holding cards.
      let payableAssets = 0;
      for (const c of payer.board.bank) payableAssets += cardValue(c);
      for (const set of payer.board.sets) {
        for (const c of set.cards) payableAssets += cardValue(c);
        if (set.house) payableAssets += cardValue(set.house);
        if (set.hotel) payableAssets += cardValue(set.hotel);
      }
      return total === payableAssets;
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

      enterRoom(res, displayName);
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

      enterRoom(res, displayName);
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
        dropRoom(roomCode, null);
      }
    },

    async reconnect(code) {
      const normalized = code.trim().toUpperCase();
      if (snapshot.roomCode === normalized && snapshot.playerToken) {
        // Already attached (or attaching) to this room — nothing to restore.
        if (!eventSource) connectSse();
        return;
      }

      const session = loadRoomSession(normalized);
      if (!session) {
        if (snapshot.roomCode) {
          // Was in a different room in this tab; the URL wins.
          eventSource?.close();
          eventSource = null;
          snapshot = emptySnapshot();
          notify();
        }
        return;
      }

      const probe = await probeRoom(normalized, session.playerToken);
      if (probe.kind === 'gone' || (probe.kind === 'ok' && !probe.info.seat)) {
        dropRoom(normalized, 'This room is no longer available.');
        return;
      }
      eventSource?.close();
      eventSource = null;
      commandSeq = loadCommandSeq(normalized);
      snapshot = {
        ...emptySnapshot(),
        roomCode: normalized,
        playerToken: session.playerToken,
        playerId: session.playerId,
        isHost: probe.kind === 'ok' && probe.info.seat ? probe.info.seat.isHost : session.isHost,
        room: probe.kind === 'ok' ? (probe.info.room ?? null) : null,
      };
      notify();
      connectSse();
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
