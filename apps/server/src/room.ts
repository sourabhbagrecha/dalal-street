import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import {
  actingPlayerForPending,
  createGame,
  dispatch,
  fixtures,
  project,
  type FixtureName,
} from '@monopoly-deal/engine';
import type {
  ClientGameState,
  Command,
  GameEvent,
  GameState,
  RoomView,
} from '@monopoly-deal/shared';
import {
  REACTION_COOLDOWN_MS,
  sanitizeGameEvent,
  type ChatMessage,
  type CommandAck,
  type ReactionKind,
  type SseEvent,
} from '@monopoly-deal/shared';
import { getTimingConfig } from './config.js';
import { getRoomStore } from './db.js';
import { log } from './logger.js';
import {
  clearDisconnectGrace,
  collectExpiredDeadlines,
  computeClientDeadlines,
  createRoomDeadlines,
  startDisconnectGrace,
  syncDeadlinesFromState,
  type RoomDeadlines,
} from './scheduler.js';
import {
  initSseResponse,
  startHeartbeat,
  stopHeartbeat,
  writeSseEvent,
  type SseClient,
} from './sse.js';
import { generatePlayerToken } from './tokens.js';

const MAX_SEATS = 5;
const CHAT_HISTORY_CAP = 100;
/** How many recent feed lines a reconnect resends — enough story to catch up on, not the whole game. */
const FEED_HISTORY_CAP = 50;
/** Server-side floor between two reactions from one seat: half the client's pace, so jitter never trips it. */
const REACTION_MIN_GAP_MS = REACTION_COOLDOWN_MS / 2;
const SCHEDULER_ONLY = new Set([
  'FORCE_END_TURN',
  'AUTO_RESOLVE_PENDING',
  'PLAYER_CONNECTION_CHANGED',
]);

export type RoomStatus = 'lobby' | 'playing' | 'finished' | 'abandoned';

/** Wire shape of a room in the sqlite store (see db.ts). Bump `v` on breaking changes. */
export interface PersistedRoom {
  v: 1;
  code: string;
  status: Exclude<RoomStatus, 'abandoned'>;
  hostPlayerId: string;
  seats: Array<{
    playerId: string;
    displayName: string;
    playerToken: string;
    lastSeq: number;
    appliedSeq: number[];
  }>;
  gameState: GameState | null;
  chatHistory: ChatMessage[];
  /**
   * Last `FEED_HISTORY_CAP` sanitized game-log lines — the same events `fanOutGameEvents` fans out
   * live, kept so a reconnect can be caught up (see `connectSse`). Optional: rooms persisted before
   * this field existed simply rehydrate with none, same as if nothing had happened yet.
   */
  feedHistory?: GameEvent[];
  nextEventId: number;
  nextChatId: number;
  createdAt: number;
  finishedAt: number | null;
}

interface Seat {
  playerId: string;
  displayName: string;
  playerToken: string;
  connected: boolean;
  appliedSeq: Set<number>;
  lastSeq: number;
  /** When this seat last reacted; in memory only, like the reactions themselves. */
  lastReactionAt: number;
}

export class Room {
  readonly code: string;
  status: RoomStatus = 'lobby';
  readonly seats: Seat[] = [];
  hostPlayerId: string;
  gameState: GameState | null = null;
  readonly deadlines: RoomDeadlines = createRoomDeadlines();
  readonly sseClients = new Map<string, SseClient>();
  readonly chatHistory: ChatMessage[] = [];
  /** See `PersistedRoom.feedHistory`. */
  readonly feedHistory: GameEvent[] = [];
  /**
   * Rematch: seats (by playerId) that have tapped "Rematch" since the current game finished. Deliberately
   * in-memory only, like `Seat.connected` and `RoomDeadlines` — a server restart already resets every
   * timer and puts every seat into disconnect grace (see `fromPersisted`), so losing an in-progress
   * "N/M ready" tally the same way is consistent, not a special case. A player who cares simply taps
   * again. Cleared every time a game begins (`beginGame`), so it never leaks into the next one.
   */
  private readonly rematchReady = new Set<string>();
  private nextEventId = 0;
  private nextChatId = 0;
  private lastSocketActivityAt = Date.now();
  private createdAt = Date.now();
  private finishedAt: number | null = null;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;

  constructor(code: string, hostDisplayName: string, seedPlayerIds?: string[]) {
    this.code = code;
    if (seedPlayerIds && seedPlayerIds.length > 0) {
      const host = this.addSeat(hostDisplayName, seedPlayerIds[0]);
      this.hostPlayerId = host.playerId;
      for (let i = 1; i < seedPlayerIds.length; i++) {
        this.addSeat(`Player ${i + 1}`, seedPlayerIds[i]);
      }
      return;
    }
    const host = this.addSeat(hostDisplayName);
    this.hostPlayerId = host.playerId;
  }

  /**
   * Builds a room already in progress from an engine fixture — dev/test tooling only
   * (see registry.createDemoRoom). Seats are keyed to the fixture's own player ids so
   * dispatched commands line up with the pre-built GameState.
   */
  static fromFixture(code: string, fixtureName: FixtureName, displayNames: string[]): Room {
    const state = structuredClone(fixtures[fixtureName]());
    const playerIds = state.players.map((p) => p.id);
    const room = new Room(code, displayNames[0] ?? 'Player 1', playerIds);
    for (let i = 1; i < room.seats.length; i++) {
      if (displayNames[i]) room.seats[i]!.displayName = displayNames[i]!;
    }
    room.gameState = state;
    room.status = 'playing';
    room.startScheduler();
    syncDeadlinesFromState(room.deadlines, state, Date.now());
    return room;
  }

  /**
   * Builds a room already in progress from a fresh CSPRNG deal for an arbitrary
   * player count — dev/test tooling only (see registry.createFreshRoom), for
   * scenarios a canned fixture can't cover (e.g. exercising a five-seat table).
   */
  static fromFreshDeal(code: string, playerCount: number, displayNames: string[]): Room {
    const playerIds = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
    const room = new Room(code, displayNames[0] ?? 'Player 1', playerIds);
    for (let i = 1; i < room.seats.length; i++) {
      if (displayNames[i]) room.seats[i]!.displayName = displayNames[i]!;
    }
    const { state } = createGame(playerIds);
    room.gameState = state;
    room.status = 'playing';
    room.startScheduler();
    syncDeadlinesFromState(room.deadlines, state, Date.now());
    return room;
  }

  /**
   * Rebuilds a room from its stored snapshot after a server restart. Everything that
   * lives in the process — SSE connections, connected flags, timers — starts empty:
   * every seat is treated as freshly disconnected (grace window running) and the
   * turn/interrupt windows restart from now rather than resuming a partial window.
   * `lastActivityAt` (the row's write time) seeds the idle clock so rooms nobody
   * touched for the whole GC window before the restart are not resurrected.
   */
  static fromPersisted(data: PersistedRoom, now: number, lastActivityAt: number): Room {
    const room = new Room(
      data.code,
      data.seats[0]?.displayName ?? 'Player 1',
      data.seats.map((s) => s.playerId),
    );
    for (let i = 0; i < data.seats.length; i++) {
      const stored = data.seats[i]!;
      const seat = room.seats[i]!;
      seat.displayName = stored.displayName;
      seat.playerToken = stored.playerToken;
      seat.lastSeq = stored.lastSeq;
      seat.appliedSeq = new Set(stored.appliedSeq);
    }
    room.hostPlayerId = data.hostPlayerId;
    room.status = data.status;
    room.gameState = data.gameState;
    room.chatHistory.push(...data.chatHistory);
    room.feedHistory.push(...(data.feedHistory ?? []));
    room.nextEventId = data.nextEventId;
    room.nextChatId = data.nextChatId;
    room.createdAt = data.createdAt;
    room.finishedAt = data.finishedAt;
    room.lastSocketActivityAt = Math.min(now, lastActivityAt);

    if (room.status === 'playing' && room.gameState) {
      room.startScheduler();
      syncDeadlinesFromState(room.deadlines, room.gameState, now);
      for (const seat of room.seats) {
        startDisconnectGrace(room.deadlines, seat.playerId, now);
      }
    }
    return room;
  }

  toPersisted(): PersistedRoom | null {
    if (this.status === 'abandoned') return null;
    return {
      v: 1,
      code: this.code,
      status: this.status,
      hostPlayerId: this.hostPlayerId,
      seats: this.seats.map((s) => ({
        playerId: s.playerId,
        displayName: s.displayName,
        playerToken: s.playerToken,
        lastSeq: s.lastSeq,
        appliedSeq: [...s.appliedSeq],
      })),
      gameState: this.gameState,
      chatHistory: this.chatHistory,
      feedHistory: this.feedHistory,
      nextEventId: this.nextEventId,
      nextChatId: this.nextChatId,
      createdAt: this.createdAt,
      finishedAt: this.finishedAt,
    };
  }

  /** Write the current snapshot to the store. Called after every durable mutation. */
  persist(): void {
    const data = this.toPersisted();
    if (!data) return;
    try {
      getRoomStore().upsert({
        code: this.code,
        status: this.status,
        snapshot: JSON.stringify(data),
        updatedAt: Date.now(),
      });
    } catch (err) {
      log('error', 'room_persist_failed', {
        roomCode: this.code,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private addSeat(displayName: string, forcedPlayerId?: string): Seat {
    const seat: Seat = {
      playerId: forcedPlayerId ?? `p_${randomBytes(8).toString('hex')}`,
      displayName,
      playerToken: generatePlayerToken(),
      connected: false,
      appliedSeq: new Set(),
      lastSeq: -1,
      lastReactionAt: 0,
    };
    this.seats.push(seat);
    return seat;
  }

  getSeatByToken(token: string): Seat | undefined {
    return this.seats.find((s) => s.playerToken === token);
  }

  getSeatByPlayerId(playerId: string): Seat | undefined {
    return this.seats.find((s) => s.playerId === playerId);
  }

  isHost(playerId: string): boolean {
    return this.hostPlayerId === playerId;
  }

  toRoomView(): RoomView {
    return {
      code: this.code,
      status: this.status,
      hostPlayerId: this.hostPlayerId,
      seats: this.seats.map((s) => ({
        playerId: s.playerId,
        displayName: s.displayName,
        connected: s.connected,
        isHost: s.playerId === this.hostPlayerId,
        rematchReady: this.rematchReady.has(s.playerId),
      })),
    };
  }

  join(displayName: string): Seat | 'full' | 'started' {
    if (this.status !== 'lobby') return 'started';
    if (this.seats.length >= MAX_SEATS) return 'full';
    const seat = this.addSeat(displayName);
    this.persist();
    return seat;
  }

  leave(playerToken: string): boolean {
    if (this.status !== 'lobby') return false;
    const idx = this.seats.findIndex((s) => s.playerToken === playerToken);
    if (idx === -1) return false;

    const [removed] = this.seats.splice(idx, 1);
    this.sseClients.delete(removed!.playerToken);

    if (this.seats.length === 0) return true;

    if (removed!.playerId === this.hostPlayerId) {
      this.hostPlayerId = this.seats[0]!.playerId;
    }
    this.persist();
    return false;
  }

  start(playerToken: string): CommandAck {
    const seat = this.getSeatByToken(playerToken);
    if (!seat) {
      return { ok: false, reason: 'Unknown player token', code: 'unauthorized' };
    }
    if (!this.isHost(seat.playerId)) {
      return { ok: false, reason: 'Only the host may start the game', code: 'forbidden' };
    }
    if (this.status !== 'lobby') {
      return { ok: false, reason: 'Game already started', code: 'bad_state' };
    }
    if (this.seats.length < 2) {
      return { ok: false, reason: 'Need at least 2 players', code: 'bad_state' };
    }

    this.beginGame();
    log('info', 'game_started', { roomCode: this.code, playerCount: this.seats.length });
    return { ok: true };
  }

  /**
   * A seated player taps "Rematch" once the game is finished. Gated on every seat tapping it — not the
   * host, not a majority — because the room model has no notion of "the room owner decides again" once a
   * game has been played; every seat that sat through the last one gets an equal vote on the next. A seat
   * that has left cannot exist here (`leave` refuses once the game has started), so "every seat" is exactly
   * "every player who played the finished game".
   */
  requestRematch(playerToken: string): CommandAck {
    const seat = this.getSeatByToken(playerToken);
    if (!seat) {
      return { ok: false, reason: 'Unknown player token', code: 'unauthorized' };
    }
    if (this.status !== 'finished') {
      return { ok: false, reason: 'Game has not finished', code: 'bad_state' };
    }

    this.rematchReady.add(seat.playerId);
    if (this.seats.every((s) => this.rematchReady.has(s.playerId))) {
      this.beginGame();
      log('info', 'rematch_started', { roomCode: this.code, playerCount: this.seats.length });
    } else {
      this.broadcastRoomUpdate();
    }
    return { ok: true };
  }

  /**
   * Deals a fresh game for the seats already at this table — the first game (`start`) and every rematch
   * (`requestRematch`) both land here. No new rule logic: `createGame` is the engine's own entry point,
   * the same one `start` always called; this only reuses the room/seat plumbing around it.
   */
  private beginGame(): void {
    const playerIds = this.seats.map((s) => s.playerId);
    const { state, events } = createGame(playerIds);
    this.gameState = state;
    this.status = 'playing';
    this.finishedAt = null;
    this.rematchReady.clear();
    this.startScheduler();
    syncDeadlinesFromState(this.deadlines, state, Date.now());
    this.persist();
    this.fanOutGameEvents(events);
    this.broadcastRoomUpdate();
    this.projectToAll();
  }

  dispatchCommand(
    playerToken: string,
    seq: number,
    command: Command,
    source: 'client' | 'scheduler',
  ): CommandAck {
    if (source === 'client' && SCHEDULER_ONLY.has(command.type)) {
      return { ok: false, reason: 'Command not allowed from client', code: 'forbidden' };
    }

    const seat = this.getSeatByToken(playerToken);
    if (!seat) {
      return { ok: false, reason: 'Unknown player token', code: 'unauthorized' };
    }
    if (command.playerId !== seat.playerId) {
      return { ok: false, reason: 'Player mismatch', code: 'forbidden' };
    }
    if (this.status !== 'playing' || !this.gameState) {
      return { ok: false, reason: 'Game not in progress', code: 'bad_state' };
    }

    if (seat.appliedSeq.has(seq)) {
      return { ok: true, duplicate: true };
    }
    if (seq <= seat.lastSeq) {
      return { ok: false, reason: 'Stale sequence number', code: 'rejected' };
    }

    const result = dispatch(this.gameState, command);
    if (result.rejected) {
      return { ok: false, reason: result.rejected, code: 'rejected' };
    }

    this.gameState = result.state;
    seat.appliedSeq.add(seq);
    seat.lastSeq = seq;

    const nonRejected = result.events.filter((e) => e.type !== 'rejected');
    this.fanOutGameEvents(nonRejected);
    syncDeadlinesFromState(this.deadlines, this.gameState, Date.now());

    if (this.gameState.turnPhase === 'game_over' || this.gameState.winnerId) {
      this.status = 'finished';
      this.finishedAt = Date.now();
      this.stopScheduler();
    }

    this.persist();
    this.projectToAll();
    return { ok: true };
  }

  private applyEngineCommand(command: Command): void {
    if (!this.gameState || this.status !== 'playing') return;

    const result = dispatch(this.gameState, command);
    if (result.rejected) {
      log('warn', 'scheduler_command_rejected', {
        roomCode: this.code,
        commandType: command.type,
        reason: result.rejected,
      });
      return;
    }

    this.gameState = result.state;
    const nonRejected = result.events.filter((e) => e.type !== 'rejected');
    this.fanOutGameEvents(nonRejected);
    syncDeadlinesFromState(this.deadlines, this.gameState, Date.now());

    if (this.gameState.turnPhase === 'game_over' || this.gameState.winnerId) {
      this.status = 'finished';
      this.finishedAt = Date.now();
      this.stopScheduler();
    }

    this.persist();
    this.projectToAll();
  }

  dispatchSchedulerCommand(command: Command): void {
    this.applyEngineCommand(command);
  }

  postChat(playerToken: string, text: string): CommandAck {
    const seat = this.getSeatByToken(playerToken);
    if (!seat) {
      return { ok: false, reason: 'Unknown player token', code: 'unauthorized' };
    }

    const message: ChatMessage = {
      id: ++this.nextChatId,
      playerId: seat.playerId,
      displayName: seat.displayName,
      text,
      sentAt: Date.now(),
    };
    this.chatHistory.push(message);
    if (this.chatHistory.length > CHAT_HISTORY_CAP) {
      this.chatHistory.splice(0, this.chatHistory.length - CHAT_HISTORY_CAP);
    }
    this.persist();
    this.broadcastChat(message);
    return { ok: true };
  }

  /**
   * A seat throws a reaction at the table. Presentation only: it never touches the game, is never
   * persisted and is not replayed to a seat that connects later — it is fanned out once and forgotten.
   */
  postReaction(playerToken: string, kind: ReactionKind, now = Date.now()): CommandAck {
    const seat = this.getSeatByToken(playerToken);
    if (!seat) {
      return { ok: false, reason: 'Unknown player token', code: 'unauthorized' };
    }
    if (now - seat.lastReactionAt < REACTION_MIN_GAP_MS) {
      return { ok: false, reason: 'Slow down', code: 'rejected' };
    }
    seat.lastReactionAt = now;
    this.writeToAllClients({
      id: this.nextId(),
      type: 'reaction',
      reaction: { playerId: seat.playerId, kind },
    });
    return { ok: true };
  }

  connectSse(playerToken: string, res: Response): void {
    const seat = this.getSeatByToken(playerToken);
    if (!seat) {
      res.status(401).json({ ok: false, reason: 'Unknown player token', code: 'unauthorized' });
      return;
    }

    const existing = this.sseClients.get(playerToken);
    if (existing) {
      stopHeartbeat(existing);
      existing.res.end();
      this.sseClients.delete(playerToken);
    }

    initSseResponse(res);
    const client: SseClient = { res, playerToken, playerId: seat.playerId };
    this.sseClients.set(playerToken, client);
    this.lastSocketActivityAt = Date.now();

    const wasDisconnected = !seat.connected;
    seat.connected = true;
    clearDisconnectGrace(this.deadlines, seat.playerId);

    if (this.status === 'playing' && this.gameState) {
      this.sendProjectionToSeat(seat);
    }
    for (const message of this.chatHistory) {
      writeSseEvent(client.res, {
        id: this.nextId(),
        type: 'chat',
        message,
      });
    }
    // Catches a reconnect up on what just happened — the same sanitized lines already fanned out live
    // (see `fanOutGameEvents`), so this leaks nothing a live seat couldn't already see.
    if (this.feedHistory.length > 0) {
      writeSseEvent(client.res, {
        id: this.nextId(),
        type: 'feedHistory',
        entries: this.feedHistory,
      });
    }
    this.broadcastRoomUpdate();

    if (wasDisconnected && this.status === 'playing' && this.gameState) {
      this.dispatchSchedulerCommand({
        type: 'PLAYER_CONNECTION_CHANGED',
        playerId: seat.playerId,
        connected: true,
      });
    }

    const timing = getTimingConfig();
    startHeartbeat(client, timing.sseHeartbeatMs, () => {
      this.handleSseDisconnect(playerToken, client);
    });

    res.on('close', () => {
      this.handleSseDisconnect(playerToken, client);
    });
  }

  /**
   * A stale connection (superseded by a newer one for the same token — e.g. React
   * StrictMode's double-invoked reconnect effect) can fire `close` after the new
   * connection has already registered. Only tear down state if this call still owns
   * the current map entry, otherwise it would evict the live connection.
   */
  private handleSseDisconnect(playerToken: string, client: SseClient): void {
    if (this.sseClients.get(playerToken) !== client) return;

    stopHeartbeat(client);
    this.sseClients.delete(playerToken);

    const seat = this.getSeatByToken(playerToken);
    if (!seat || !seat.connected) return;

    seat.connected = false;
    this.lastSocketActivityAt = Date.now();
    startDisconnectGrace(this.deadlines, seat.playerId, Date.now());

    if (this.status === 'playing' && this.gameState) {
      this.dispatchSchedulerCommand({
        type: 'PLAYER_CONNECTION_CHANGED',
        playerId: seat.playerId,
        connected: false,
      });
    } else {
      this.broadcastRoomUpdate();
    }
  }

  private startScheduler(): void {
    if (this.schedulerTimer) return;
    this.schedulerTimer = setInterval(() => this.tickScheduler(), 250);
  }

  private stopScheduler(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  private tickScheduler(): void {
    if (!this.gameState || this.status !== 'playing') return;

    const now = Date.now();
    const expired = collectExpiredDeadlines(this.deadlines, now);

    for (const item of expired) {
      if (item.kind === 'turn') {
        this.dispatchSchedulerCommand({
          type: 'FORCE_END_TURN',
          playerId: item.playerId,
        });
      } else if (item.kind === 'pending') {
        this.autoResolveExpiredPending();
      }
      // disconnect grace expiry: seat stays disconnected; windows resolve via auto rules
    }

    if (expired.length > 0) {
      syncDeadlinesFromState(this.deadlines, this.gameState, Date.now());
      this.projectToAll();
    }
  }

  /** Resolve every seat that still owes a response on the current pending top. */
  private autoResolveExpiredPending(): void {
    if (!this.gameState) return;
    const top = this.gameState.pendingStack[this.gameState.pendingStack.length - 1];
    if (!top) return;

    if (top.kind === 'payment_round') {
      const actors: string[] = [];
      for (const entry of top.entries) {
        if (entry.phase === 'jsn' && entry.jsn) actors.push(entry.jsn.respondentId);
        else if (entry.phase === 'payment') actors.push(entry.payerId);
      }
      for (const playerId of actors) {
        this.dispatchSchedulerCommand({ type: 'AUTO_RESOLVE_PENDING', playerId });
      }
      return;
    }

    const actor = actingPlayerForPending(top);
    if (actor) {
      this.dispatchSchedulerCommand({ type: 'AUTO_RESOLVE_PENDING', playerId: actor });
    }
  }

  private nextId(): number {
    this.nextEventId += 1;
    return this.nextEventId;
  }

  private fanOutGameEvents(events: GameEvent[]): void {
    for (const event of events) {
      const sanitized = sanitizeGameEvent(event);
      const entry: GameEvent = {
        type: sanitized.type,
        playerId: sanitized.playerId,
        message: sanitized.message,
        data: sanitized.data,
      };
      this.feedHistory.push(entry);
      if (this.feedHistory.length > FEED_HISTORY_CAP) {
        this.feedHistory.splice(0, this.feedHistory.length - FEED_HISTORY_CAP);
      }
      const sseEvent: SseEvent = {
        id: this.nextId(),
        type: 'event',
        event: entry,
      };
      this.writeToAllClients(sseEvent);
    }
  }

  broadcastRoomUpdate(): void {
    const sseEvent: SseEvent = {
      id: this.nextId(),
      type: 'roomUpdate',
      room: this.toRoomView(),
    };
    this.writeToAllClients(sseEvent);
  }

  private broadcastChat(message: ChatMessage): void {
    const sseEvent: SseEvent = {
      id: this.nextId(),
      type: 'chat',
      message,
    };
    this.writeToAllClients(sseEvent);
  }

  projectToAll(): void {
    if (!this.gameState) return;
    for (const seat of this.seats) {
      this.sendProjectionToSeat(seat);
    }
  }

  private sendProjectionToSeat(seat: Seat): void {
    if (!this.gameState) return;
    const client = this.sseClients.get(seat.playerToken);
    if (!client) return;

    const projection = this.buildProjection(seat.playerId);
    const sseEvent: SseEvent = {
      id: this.nextId(),
      type: 'projection',
      state: projection,
    };
    writeSseEvent(client.res, sseEvent);
  }

  private buildProjection(viewerId: string): ClientGameState {
    if (!this.gameState) {
      throw new Error('No game state');
    }
    const now = Date.now();
    const displayNames: Record<string, string> = {};
    const connected: Record<string, boolean> = {};
    for (const s of this.seats) {
      displayNames[s.playerId] = s.displayName;
      connected[s.playerId] = s.connected;
    }
    return project(this.gameState, viewerId, {
      displayNames,
      connected,
      deadlines: computeClientDeadlines(this.deadlines, now),
    });
  }

  private writeToAllClients(event: SseEvent): void {
    for (const client of this.sseClients.values()) {
      try {
        writeSseEvent(client.res, event);
      } catch {
        // disconnect handled on close
      }
    }
  }

  shouldGc(now: number): boolean {
    const timing = getTimingConfig();

    if (this.status === 'finished' && this.finishedAt !== null) {
      return now - this.finishedAt >= timing.roomGcFinishedMs;
    }

    if (this.sseClients.size === 0) {
      return now - this.lastSocketActivityAt >= timing.roomGcEmptyMs;
    }

    if (
      this.status === 'playing' &&
      this.seats.every((s) => !s.connected) &&
      this.seats.every((s) => !this.deadlines.disconnectGrace.has(s.playerId))
    ) {
      return now - this.lastSocketActivityAt >= timing.roomGcEmptyMs;
    }

    return false;
  }

  destroy(): void {
    this.stopScheduler();
    for (const client of this.sseClients.values()) {
      stopHeartbeat(client);
      client.res.end();
    }
    this.sseClients.clear();
    this.status = 'abandoned';
  }
}
