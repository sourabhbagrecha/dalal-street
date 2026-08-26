import type {
  ClientGameState,
  CommandAck,
  GameEvent,
  PropertySet,
  SseEvent,
  WireCommandType,
} from '@monopoly-deal/shared';
import type { Card } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import type { FixtureName } from '@monopoly-deal/engine';
import type { GameStoreApi, StoreSnapshot, StealableOption } from './types';
import { appendSingleLog } from './logUtils';
import { removalCost, wastedDiscardPlay } from '@monopoly-deal/engine';
import { resolveWildPlayColor } from '../wildFaceStore';

/**
 * Dev-only adapter for the /demo route: talks to a real server room seeded from an
 * engine fixture (see apps/server's /dev/rooms/fixture), so "seat switching" replays
 * a real HTTP+SSE round-trip per seat rather than a client-side reprojection like
 * localAdapter. Deliberately self-contained (small duplication of networkAdapter's
 * command/session plumbing) rather than sharing code with the production network path.
 */

type Listener = () => void;

interface DemoSeat {
  playerId: string;
  playerToken: string;
  displayName: string;
}

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

export function createDemoAdapter(): GameStoreApi {
  let snapshot: StoreSnapshot = emptySnapshot();
  const listeners = new Set<Listener>();
  let eventSource: EventSource | null = null;
  let commandSeq = 0;
  let logSeq = 0;
  let seats: DemoSeat[] = [];

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
    es.onerror = () => setSnapshot({ sseStatus: 'error' });

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
    if (!roomCode || !playerToken) return { ok: false, reason: 'No demo scenario loaded' };

    const seq = commandSeq++;
    const ack = await postJson<CommandAck>(`/rooms/${encodeURIComponent(roomCode)}/commands`, {
      v: 1,
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

    setSeat(index) {
      const seat = seats[index];
      if (!seat) return;
      setSnapshot({
        localSeatIndex: index,
        playerId: seat.playerId,
        playerToken: seat.playerToken,
        isHost: index === 0,
        rejected: null,
        clientState: null,
      });
      connectSse();
    },

    async loadFixture(name: FixtureName) {
      eventSource?.close();
      eventSource = null;

      const res = await postJson<{ roomCode: string; seats: (DemoSeat & { seatIndex: number; isHost: boolean })[] }>(
        '/dev/rooms/fixture',
        { fixtureName: name },
      );
      if (!res.ok || !res.roomCode || !res.seats) {
        setSnapshot({ lobbyError: res.reason ?? 'Failed to load demo scenario' });
        return;
      }

      seats = res.seats.map((s) => ({
        playerId: s.playerId,
        playerToken: s.playerToken,
        displayName: s.displayName,
      }));
      commandSeq = 0;
      logSeq = 0;
      const host = seats[0]!;
      setSnapshot({
        roomCode: res.roomCode,
        playerToken: host.playerToken,
        playerId: host.playerId,
        isHost: true,
        localSeatIndex: 0,
        log: [],
        chatMessages: [],
        rejected: null,
        lobbyError: null,
        clientState: null,
      });
      connectSse();
    },
  };

  return api;
}
