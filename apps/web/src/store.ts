import { create } from 'zustand';
import {
  createGame,
  dispatch,
  fixtures,
  getLegalCommands,
  type FixtureName,
} from '@monopoly-deal/engine';
import type { Command, GameEvent, GameState, PlayTarget, PlayZone } from '@monopoly-deal/shared';

export interface LogEntry extends GameEvent {
  id: number;
  at: string;
}

interface GameStore {
  state: GameState;
  log: LogEntry[];
  localSeatIndex: number;
  rejected: string | null;
  logSeq: number;
  startNewGame: (playerCount?: number, seed?: number) => void;
  loadFixture: (name: FixtureName) => void;
  setSeat: (index: number) => void;
  send: (command: Command) => void;
  rejectLocal: (message: string) => void;
  clearRejected: () => void;
  draw: () => void;
  endTurn: () => void;
  playCard: (cardId: string, zone: PlayZone, target?: PlayTarget) => void;
}

function appendLog(log: LogEntry[], events: GameEvent[], seq: number): { log: LogEntry[]; seq: number } {
  const next = [...log];
  let s = seq;
  for (const e of events) {
    if (e.type === 'rejected') continue;
    s += 1;
    next.push({
      ...e,
      id: s,
      at: new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
    });
  }
  return { log: next.slice(-200), seq: s };
}

function freshGame(playerCount = 4, seed = Date.now() % 1_000_000): {
  state: GameState;
  events: GameEvent[];
} {
  const ids = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
  return createGame(ids, seed);
}

export const useGameStore = create<GameStore>((set, get) => {
  const started = freshGame(4, 42);
  return {
    state: started.state,
    log: appendLog([], started.events, 0).log,
    localSeatIndex: 0,
    rejected: null,
    logSeq: started.events.length,

    startNewGame(playerCount = 4, seed = Date.now() % 1_000_000) {
      const { state, events } = freshGame(playerCount, seed);
      const { log, seq } = appendLog([], events, 0);
      set({ state, log, logSeq: seq, localSeatIndex: 0, rejected: null });
    },

    loadFixture(name) {
      const state = structuredClone(fixtures[name]());
      const { log, seq } = appendLog(
        [],
        [{ type: 'game_started', message: `Loaded fixture ${name}` }],
        0,
      );
      set({ state, log, logSeq: seq, localSeatIndex: 0, rejected: null });
    },

    setSeat(index) {
      const n = get().state.players.length;
      if (index >= 0 && index < n) set({ localSeatIndex: index, rejected: null });
    },

    rejectLocal(message) {
      set({ rejected: message });
    },

    clearRejected() {
      set({ rejected: null });
    },

    send(command) {
      const { state, log, logSeq } = get();
      const result = dispatch(state, command);
      if (result.rejected) {
        set({ rejected: result.rejected });
        return;
      }
      const appended = appendLog(log, result.events, logSeq);
      set({
        state: result.state,
        log: appended.log,
        logSeq: appended.seq,
        rejected: null,
      });
    },

    draw() {
      const { state, localSeatIndex, send } = get();
      const player = state.players[localSeatIndex];
      if (!player) return;
      send({ type: 'DRAW_TURN_CARDS', playerId: player.id });
    },

    endTurn() {
      const { state, localSeatIndex, send } = get();
      const player = state.players[localSeatIndex];
      if (!player) return;
      send({ type: 'END_TURN', playerId: player.id });
    },

    playCard(cardId, zone, target) {
      const { state, localSeatIndex, send } = get();
      const player = state.players[localSeatIndex];
      if (!player) return;
      send({
        type: 'PLAY_CARD',
        playerId: player.id,
        cardId,
        zone,
        target,
      });
    },
  };
});

export function selectLocalPlayer(s: GameStore) {
  return s.state.players[s.localSeatIndex] ?? s.state.players[0]!;
}

export function selectLegal(s: GameStore) {
  return getLegalCommands(s.state);
}
