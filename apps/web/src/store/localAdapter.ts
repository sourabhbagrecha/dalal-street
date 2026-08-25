import {
  createGame,
  dispatch,
  fixtures,
  isCompleteSet,
  isValidPaymentSelection,
  project,
  removalCost,
  stealableProperties,
  wastedDiscardPlay,
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
import type { GameStoreApi, StoreSnapshot, StealableOption, TurnEndInfo } from './types';
import { appendLog } from './logUtils';
import { appendNotices } from './notices';
import { theme } from '../theme';
import {
  canDraw as engineCanDraw,
  canEndTurn as engineCanEndTurn,
  legalPlayZones as engineLegalPlayZones,
  pickPlayCommand as enginePickPlayCommand,
} from './localLegality';

type Listener = () => void;

// The `/local` (pass-and-play) route has to produce a genuinely different deal
// every time it boots — randomness is generated here, in the web app, rather
// than inside `packages/engine`, which stays pure and only ever shuffles with
// whatever seed it's handed. `Math.random()` (not `Date.now()`) so two calls
// made in the same millisecond — e.g. "New game" clicked twice fast — never
// collide on a seed.
function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

// Dev/test builds (`import.meta.env.DEV`, which is what `pnpm dev` and the
// Playwright e2e suite both run against) default the *initial* boot deal to
// the historical fixed seed — the append-only e2e specs assert on specific
// cards a real shuffle would scatter unpredictably (e.g. happy-path.spec.ts
// drags `hand-card-money_5m_22` right after `page.goto('/local')`). An
// explicit `?seed=<n>` still overrides it, for reproducing one particular
// deal by hand. Production builds always deal genuinely random — that's the
// actual player-facing fix (see CLAUDE.md: "seeds injectable in test builds
// only"). Either way, "New game" (see startNewGame) always deals randomly
// regardless of build: it's the explicit "give me a different game" action.
const DEV_FIXED_SEED = 42;

function seedFromQuery(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function bootSeed(): number {
  const override = seedFromQuery();
  if (override !== null) return override;
  return import.meta.env.DEV ? DEV_FIXED_SEED : randomSeed();
}

function freshGame(playerCount = 4, seed = bootSeed()): {
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

// ── sessionStorage persistence ───────────────────────────────────────────
//
// A local game lives entirely in this module's closures otherwise, so a
// pull-to-refresh, rotation, or back-swipe on a phone would silently reset
// the board. sessionStorage (not localStorage — this is one tab's game, not
// a durable save) survives a reload but not a closed tab, which matches
// pass-and-play's lifetime. The key is versioned so a future shape change
// can invalidate old saves outright rather than crash trying to rehydrate
// them; every access is try/catch'd because Safari private mode throws on
// storage access instead of just no-op'ing.
const STORAGE_KEY = 'md.local.game.v1';
const STORAGE_VERSION = 1;

interface PersistedLocalGame {
  v: number;
  state: GameState;
  localSeatIndex: number;
  log: StoreSnapshot['log'];
  logSeq: number;
  lastTurnEnd: TurnEndInfo | null;
}

function loadPersisted(): PersistedLocalGame | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedLocalGame> | null;
    if (
      !parsed ||
      parsed.v !== STORAGE_VERSION ||
      !parsed.state ||
      !Array.isArray(parsed.state.players) ||
      parsed.state.players.length < 2 ||
      typeof parsed.localSeatIndex !== 'number' ||
      parsed.localSeatIndex < 0 ||
      parsed.localSeatIndex >= parsed.state.players.length ||
      !Array.isArray(parsed.log) ||
      typeof parsed.logSeq !== 'number'
    ) {
      return null;
    }
    return {
      v: parsed.v,
      state: parsed.state,
      localSeatIndex: parsed.localSeatIndex,
      log: parsed.log,
      logSeq: parsed.logSeq,
      lastTurnEnd: parsed.lastTurnEnd ?? null,
    };
  } catch {
    return null;
  }
}

function savePersisted(data: PersistedLocalGame): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Safari private mode (and a full quota) throw on write — the game just
    // won't survive a reload this session, which is a safe degradation.
  }
}

function clearPersisted(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore — see savePersisted
  }
}

/** Fields of StoreSnapshot that aren't part of the engine game state itself. */
function baseSnapshotFields(): Omit<
  StoreSnapshot,
  'clientState' | 'log' | 'localSeatIndex' | 'lastTurnEnd'
> {
  return {
    chatMessages: [],
    rejected: null,
    notices: [],
    mode: 'local',
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
  const persisted = loadPersisted();

  let engineState: GameState;
  let snapshot: StoreSnapshot;
  let logSeq: number;

  if (persisted) {
    engineState = persisted.state;
    snapshot = {
      ...baseSnapshotFields(),
      clientState: toClientState(engineState, persisted.localSeatIndex),
      log: persisted.log,
      localSeatIndex: persisted.localSeatIndex,
      lastTurnEnd: persisted.lastTurnEnd,
    };
    logSeq = persisted.logSeq;
  } else {
    const started = freshGame(4);
    engineState = started.state;
    const { log, seq } = appendLog([], started.events, 0);
    snapshot = {
      ...baseSnapshotFields(),
      clientState: toClientState(engineState, 0),
      log,
      localSeatIndex: 0,
      lastTurnEnd: null,
    };
    logSeq = seq;
  }

  const listeners = new Set<Listener>();

  const notify = () => {
    for (const l of listeners) l();
  };

  const persist = () => {
    savePersisted({
      v: STORAGE_VERSION,
      state: engineState,
      localSeatIndex: snapshot.localSeatIndex,
      log: snapshot.log,
      logSeq,
      lastTurnEnd: snapshot.lastTurnEnd ?? null,
    });
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
    const outgoingPlayerId = engineState.players[engineState.currentPlayerIndex]!.id;
    const result = dispatch(engineState, command);
    if (result.rejected) {
      setSnapshot({ rejected: result.rejected });
      return;
    }
    engineState = result.state;

    // The engine's own `turn_ended` event message never says *why* the turn
    // ended (see TurnEndInfo) — but the command that produced it does: an
    // explicit END_TURN is always the "ended their turn" case, since the
    // "plays ran out" auto-end (maybeAutoEndTurn in dispatch.ts) fires as a
    // side effect of some other command (almost always the 3rd PLAY_CARD)
    // and the player never gets to press END_TURN at all in that case.
    const turnEndedEvent = result.events.find((e) => e.type === 'turn_ended');
    const lastTurnEnd: TurnEndInfo | null = turnEndedEvent
      ? {
          playerId: turnEndedEvent.playerId ?? outgoingPlayerId,
          reason: command.type === 'END_TURN' ? 'manual' : 'plays',
        }
      : (snapshot.lastTurnEnd ?? null);

    const appended = appendLog(snapshot.log, result.events, logSeq);
    logSeq = appended.seq;
    syncClientState();

    // A notice is worded from its own recipient's point of view ("Aarav
    // sly-dealt a property from you"), not whoever the *current* live
    // viewer happens to be — see `ViewerStateFor`'s doc comment. Local
    // pass-and-play can build that cheaply straight from the just-updated
    // engine state, for any seat, regardless of who's actually looking at
    // the screen right now.
    const stateForPlayer = (playerId: string): ClientGameState | null => {
      const idx = engineState.players.findIndex((p) => p.id === playerId);
      return idx >= 0 ? toClientState(engineState, idx) : null;
    };

    // Local pass-and-play has no scheduler, so every payment here is the
    // synchronous result of a command the currently-active seat just chose
    // to submit — never a server-side auto-pay — so the payer never gets
    // the "paid automatically" framing, only the payee's "you were paid".
    const notices = appendNotices(snapshot.notices ?? [], stateForPlayer, theme.formatMoney, result.events, {
      selfInitiatedPayment: true,
    });

    setSnapshot({ log: appended.log, rejected: null, lastTurnEnd, notices });
    persist();
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

    removalCost(cardId: string) {
      const board = engineState.players.find((p) => p.id === viewerId())?.board;
      return board ? removalCost(board, cardId) : null;
    },

    wastedDiscardPlay(cardId: string) {
      const state = snapshot.clientState;
      return state ? wastedDiscardPlay(state, cardId) : null;
    },

    isCompleteSet(set: PropertySet) {
      return isCompleteSet(set);
    },

    setSeat(index) {
      const n = engineState.players.length;
      if (index >= 0 && index < n) {
        syncClientState(index);
        setSnapshot({ localSeatIndex: index, rejected: null });
        persist();
      }
    },

    startNewGame(playerCount = 4, seed = randomSeed()) {
      clearPersisted();
      const { state, events } = freshGame(playerCount, seed);
      engineState = state;
      const { log, seq } = appendLog([], events, 0);
      logSeq = seq;
      syncClientState(0);
      setSnapshot({ log, localSeatIndex: 0, rejected: null, lastTurnEnd: null });
      persist();
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
      setSnapshot({ log, localSeatIndex: 0, rejected: null, lastTurnEnd: null });
      persist();
    },
  };
}
