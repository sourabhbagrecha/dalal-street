import {
  createGame,
  dispatch,
  fixtures,
  isCompleteSet,
  isValidPaymentSelection,
  project,
  stealableProperties,
  type FixtureName,
} from '@monopoly-deal/engine';
import type {
  ClientGameState,
  Command,
  GameState,
  PlayTarget,
  PlayZone,
  PropertySet,
} from '@monopoly-deal/shared';
import type { GameStoreApi, StoreSnapshot, StealableOption } from './types';
import { appendLog } from './logUtils';
import {
  canDraw as engineCanDraw,
  canEndTurn as engineCanEndTurn,
  legalPlayZones as engineLegalPlayZones,
  pickPlayCommand as enginePickPlayCommand,
} from './localLegality';

type Listener = () => void;

function freshGame(playerCount = 4, seed = Date.now() % 1_000_000): {
  state: GameState;
  events: import('@monopoly-deal/shared').GameEvent[];
} {
  const ids = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
  return createGame(ids, seed);
}

function toClientState(state: GameState, seatIndex: number): ClientGameState {
  const playerId = state.players[seatIndex]?.id ?? state.players[0]!.id;
  return project(state, playerId, { connected: Object.fromEntries(state.players.map((p) => [p.id, true])) });
}

function initialSnapshot(): StoreSnapshot {
  const started = freshGame(4, 42);
  const clientState = toClientState(started.state, 0);
  const { log } = appendLog([], started.events, 0);
  return {
    clientState,
    log,
    chatMessages: [],
    rejected: null,
    mode: 'local',
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

export function createLocalAdapter(): GameStoreApi {
  let snapshot = initialSnapshot();
  let engineState = freshGame(4, 42).state;
  const listeners = new Set<Listener>();
  let logSeq = 0;

  const notify = () => {
    for (const l of listeners) l();
  };

  const setSnapshot = (partial: Partial<StoreSnapshot>) => {
    snapshot = { ...snapshot, ...partial };
    notify();
  };

  const syncClientState = (seatIndex = snapshot.localSeatIndex) => {
    const clientState = toClientState(engineState, seatIndex);
    setSnapshot({ clientState, localSeatIndex: seatIndex });
  };

  const applyEngine = (command: Command) => {
    const result = dispatch(engineState, command);
    if (result.rejected) {
      setSnapshot({ rejected: result.rejected });
      return;
    }
    engineState = result.state;
    const appended = appendLog(snapshot.log, result.events, logSeq);
    logSeq = appended.seq;
    syncClientState();
    setSnapshot({ log: appended.log, rejected: null });
  };

  const viewerId = () => snapshot.clientState?.viewerId ?? engineState.players[0]!.id;

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async dispatchCommand(type, payload = {}) {
      if (type === 'DRAW_TURN_CARDS') {
        applyEngine({ type: 'DRAW_TURN_CARDS', playerId: viewerId() });
        return { ok: !snapshot.rejected, reason: snapshot.rejected ?? undefined };
      }
      if (type === 'END_TURN') {
        applyEngine({ type: 'END_TURN', playerId: viewerId() });
        return { ok: !snapshot.rejected, reason: snapshot.rejected ?? undefined };
      }
      if (type === 'PLAY_CARD') {
        const cardId = String(payload.cardId ?? '');
        const zone = payload.zone as PlayZone;
        const target = payload.target as PlayTarget | undefined;
        applyEngine({ type: 'PLAY_CARD', playerId: viewerId(), cardId, zone, target });
        return { ok: !snapshot.rejected, reason: snapshot.rejected ?? undefined };
      }
      applyEngine({ type: type as Command['type'], playerId: viewerId(), ...payload } as Command);
      return { ok: !snapshot.rejected, reason: snapshot.rejected ?? undefined };
    },

    draw() {
      applyEngine({ type: 'DRAW_TURN_CARDS', playerId: viewerId() });
    },

    endTurn() {
      applyEngine({ type: 'END_TURN', playerId: viewerId() });
    },

    playCard(cardId, zone, target) {
      applyEngine({ type: 'PLAY_CARD', playerId: viewerId(), cardId, zone, target });
    },

    send(command) {
      applyEngine(command);
    },

    rejectLocal(message) {
      setSnapshot({ rejected: message });
    },

    clearRejected() {
      setSnapshot({ rejected: null });
    },

    getLegalPlayZones(cardId) {
      return engineLegalPlayZones(engineState, viewerId(), cardId);
    },

    canDraw() {
      return engineCanDraw(engineState, viewerId());
    },

    canEndTurn() {
      return engineCanEndTurn(engineState, viewerId());
    },

    pickPlayCommand(cardId, zone, target) {
      const cmd = enginePickPlayCommand(engineState, viewerId(), cardId, zone, target);
      if (!cmd) return undefined;
      return { cardId: cmd.cardId, zone: cmd.zone, target: cmd.target };
    },

    validatePayment(payerId, amountDue, cardIds) {
      return isValidPaymentSelection(engineState, payerId, amountDue, cardIds);
    },

    stealableProperties(actorId, selfOnly) {
      if (selfOnly) {
        const actor = engineState.players.find((p) => p.id === actorId);
        if (!actor) return [];
        return stealableProperties(actor).map(({ card }) => ({ card }));
      }
      const out: StealableOption[] = [];
      for (const p of engineState.players.filter((pl) => pl.id !== actorId)) {
        for (const { card } of stealableProperties(p)) {
          out.push({ card });
        }
      }
      return out;
    },

    isCompleteSet(set: PropertySet) {
      return isCompleteSet(set);
    },

    setSeat(index) {
      const n = engineState.players.length;
      if (index >= 0 && index < n) {
        syncClientState(index);
        setSnapshot({ localSeatIndex: index, rejected: null });
      }
    },

    startNewGame(playerCount = 4, seed = Date.now() % 1_000_000) {
      const { state, events } = freshGame(playerCount, seed);
      engineState = state;
      const { log, seq } = appendLog([], events, 0);
      logSeq = seq;
      syncClientState(0);
      setSnapshot({ log, localSeatIndex: 0, rejected: null });
    },

    loadFixture(name: FixtureName) {
      engineState = structuredClone(fixtures[name]());
      const { log, seq } = appendLog(
        [],
        [{ type: 'game_started', message: `Loaded fixture ${name}` }],
        0,
      );
      logSeq = seq;
      syncClientState(0);
      setSnapshot({ log, localSeatIndex: 0, rejected: null });
    },
  };
}
