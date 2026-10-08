import type { ClientGameState, CommandAck, GameEvent, Reaction, SseEvent, WireCommandType } from '@monopoly-deal/shared';
import { selfOf } from '@monopoly-deal/shared';
import type { FixtureName } from '@monopoly-deal/engine';
import type { GameStoreApi, StoreSnapshot, StealableOption } from './types';
import { appendHistoryLog, appendSingleLog } from './logUtils';
import { cardValue, emptySnapshot, isCompleteSet, stealableFromBoard } from './boardHints';
import { removalCost, wastedDiscardPlay } from '@monopoly-deal/engine';
import { theme } from '../theme';
import { resolveWildPlayColor } from '../wildcardTarget';

/**
 * Dev-only adapter for the /demo route: talks to a real server room seeded from an
 * engine fixture, or freshly dealt for an arbitrary player count (see apps/server's
 * /dev/rooms/fixture and /dev/rooms/new), so "seat switching" replays a real HTTP+SSE
 * round-trip per seat rather than a client-side reprojection. Deliberately
 * self-contained (small duplication of networkAdapter's command/session plumbing)
 * rather than sharing code with the production network path.
 */

type Listener = () => void;

interface DemoSeat {
  playerId: string;
  playerToken: string;
  displayName: string;
}

export function createDemoAdapter(): GameStoreApi {
  let snapshot: StoreSnapshot = emptySnapshot();
  const listeners = new Set<Listener>();
  const reactionListeners = new Set<(reaction: Reaction) => void>();
  let eventSource: EventSource | null = null;
  let commandSeq = 0;
  let logSeq = 0;
  let seats: DemoSeat[] = [];
  /**
   * Guards against the initial mount's default-fixture load and an
   * immediately-following explicit loadFixture/startNewGame call (e.g. an
   * e2e test picking a scenario right after navigating) resolving out of
   * order over the network — only the response to the most recently issued
   * request is ever applied.
   */
  let requestGen = 0;

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
      case 'feedHistory': {
        const appended = appendHistoryLog(snapshot.log, raw.entries as GameEvent[], logSeq);
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
      case 'reaction':
        for (const l of reactionListeners) l(raw.reaction);
        break;
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

    for (const type of ['projection', 'event', 'feedHistory', 'roomUpdate', 'error', 'chat', 'reaction'] as const) {
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

  type DevRoomResponse = { roomCode: string; seats: (DemoSeat & { seatIndex: number; isHost: boolean })[] };

  const applyDevRoomResponse = (
    res: DevRoomResponse & { ok: boolean; reason?: string },
    failureMessage: string,
    gen: number,
  ) => {
    if (gen !== requestGen) return;

    eventSource?.close();
    eventSource = null;

    if (!res.ok || !res.roomCode || !res.seats) {
      setSnapshot({ lobbyError: res.reason ?? failureMessage });
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
      return postCommand('DRAW_TURN_CARDS');
    },

    endTurn() {
      return postCommand('END_TURN');
    },

    playCard(cardId, zone, target) {
      return postCommand('PLAY_CARD', { cardId, zone, target });
    },

    send(command) {
      const { type, ...rest } = command;
      const payload = { ...rest };
      delete (payload as { playerId?: string }).playerId;
      return postCommand(type as WireCommandType, payload as Record<string, unknown>);
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
        const card = state?.hand.find((c) => c.id === cardId);
        if (card && card.kind === 'property_wild') {
          const color = resolveWildPlayColor(card, selfOf(state!).board.sets);
          if (color) target = { assignedColor: color };
        }
      }
      return { cardId, zone, target };
    },

    validatePayment(payerId, amountDue, cardIds) {
      const state = snapshot.clientState;
      if (!state) return false;
      const payer = state.players.find((p) => p.id === payerId);
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
          for (const c of state.hand) {
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
      const boardFor = (id: string) => state.players.find((p) => p.id === id)?.board;
      if (selfOnly) {
        const board = boardFor(actorId);
        return board ? stealableFromBoard(board) : [];
      }
      const out: StealableOption[] = [];
      for (const p of state.players.filter((pl) => pl.id !== actorId)) {
        out.push(...stealableFromBoard(p.board));
      }
      return out;
    },

    removalCost(cardId) {
      const state = snapshot.clientState;
      return state ? removalCost(selfOf(state).board, cardId) : null;
    },

    wastedDiscardPlay(cardId) {
      const state = snapshot.clientState;
      return state ? wastedDiscardPlay(state, cardId) : null;
    },

    isCompleteSet,

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

    sendReaction(kind) {
      const { roomCode, playerToken } = snapshot;
      if (!roomCode || !playerToken) return;
      void postJson(`/rooms/${encodeURIComponent(roomCode)}/react`, { v: 1, playerToken, kind }).catch(() => undefined);
    },

    onReaction(listener) {
      reactionListeners.add(listener);
      return () => reactionListeners.delete(listener);
    },

    async loadFixture(name: FixtureName) {
      const gen = ++requestGen;
      const res = await postJson<DevRoomResponse>('/dev/rooms/fixture', {
        fixtureName: name,
        displayNames: theme.playerNames,
      });
      applyDevRoomResponse(res, 'Failed to load demo scenario', gen);
    },

    async startNewGame(playerCount = 4) {
      const gen = ++requestGen;
      const res = await postJson<DevRoomResponse>('/dev/rooms/new', {
        playerCount,
        displayNames: theme.playerNames,
      });
      applyDevRoomResponse(res, 'Failed to deal a new game', gen);
    },
  };

  return api;
}
