import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import {
  actingPlayerForPending,
  createGame,
  dispatch,
  fixtures,
  getLegalCommands,
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
  sanitizeGameEvent,
  type ChatMessage,
  type CommandAck,
  type SseEvent,
} from '@monopoly-deal/shared';
import { botThinkingDelayMs, chooseBotCommand } from './bot.js';
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
    /** Server-side bot seat. Older snapshots predate this field — treated as false. */
    isBot?: boolean;
  }>;
  gameState: GameState | null;
  chatHistory: ChatMessage[];
  nextEventId: number;
  nextChatId: number;
  createdAt: number;
  finishedAt: number | null;
}

export interface Seat {
  playerId: string;
  displayName: string;
  playerToken: string;
  connected: boolean;
  appliedSeq: Set<number>;
  lastSeq: number;
  /** A server-side bot seat, added via "Add a bot" / "Play vs computer" — permanent. */
  isBot: boolean;
  /** A human seat currently played by a bot policy because its disconnect grace ran out. */
  botControlled: boolean;
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
  private nextEventId = 0;
  private nextChatId = 0;
  private lastSocketActivityAt = Date.now();
  private createdAt = Date.now();
  private finishedAt: number | null = null;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  /** One pending bot-move timer per acting bot-controlled seat — see syncBotMoves. */
  private readonly botTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
    room.syncBotMoves();
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
    room.syncBotMoves();
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
      seat.isBot = stored.isBot ?? false;
      // A bot has no SSE lifecycle to restore — it comes back live, same as it left.
      if (seat.isBot) seat.connected = true;
    }
    room.hostPlayerId = data.hostPlayerId;
    room.status = data.status;
    room.gameState = data.gameState;
    room.chatHistory.push(...data.chatHistory);
    room.nextEventId = data.nextEventId;
    room.nextChatId = data.nextChatId;
    room.createdAt = data.createdAt;
    room.finishedAt = data.finishedAt;
    room.lastSocketActivityAt = Math.min(now, lastActivityAt);

    if (room.status === 'playing' && room.gameState) {
      room.startScheduler();
      syncDeadlinesFromState(room.deadlines, room.gameState, now);
      // Bots have no connection to lose — only human seats restart in disconnect grace.
      for (const seat of room.seats) {
        if (!seat.isBot) startDisconnectGrace(room.deadlines, seat.playerId, now);
      }
      room.syncBotMoves();
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
        isBot: s.isBot,
      })),
      gameState: this.gameState,
      chatHistory: this.chatHistory,
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

  private addSeat(displayName: string, forcedPlayerId?: string, opts?: { isBot?: boolean }): Seat {
    const isBot = opts?.isBot ?? false;
    const seat: Seat = {
      playerId: forcedPlayerId ?? `p_${randomBytes(8).toString('hex')}`,
      displayName,
      playerToken: generatePlayerToken(),
      // A bot has no SSE connection to go live on — it is "connected" from the start.
      connected: isBot,
      appliedSeq: new Set(),
      lastSeq: -1,
      isBot,
      botControlled: false,
    };
    this.seats.push(seat);
    return seat;
  }

  /** Next unused "Bot N" name, so re-adding after one leaves doesn't collide. */
  private nextBotName(): string {
    return `Bot ${this.seats.filter((s) => s.isBot).length + 1}`;
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
        isBot: s.isBot,
        botControlled: s.botControlled,
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

  /** Host fills the next open chair with a bot (lobby only). */
  addBot(playerToken: string): CommandAck {
    const seat = this.getSeatByToken(playerToken);
    if (!seat) {
      return { ok: false, reason: 'Unknown player token', code: 'unauthorized' };
    }
    if (!this.isHost(seat.playerId)) {
      return { ok: false, reason: 'Only the host may add a bot', code: 'forbidden' };
    }
    if (this.status !== 'lobby') {
      return { ok: false, reason: 'Game already started', code: 'bad_state' };
    }
    if (this.seats.length >= MAX_SEATS) {
      return { ok: false, reason: 'Room is full', code: 'room_full' };
    }
    this.addSeat(this.nextBotName(), undefined, { isBot: true });
    this.persist();
    this.broadcastRoomUpdate();
    return { ok: true };
  }

  /** Fills every open chair with a bot (lobby only) — used by "Play vs computer". */
  fillWithBots(): void {
    while (this.status === 'lobby' && this.seats.length < MAX_SEATS) {
      this.addSeat(this.nextBotName(), undefined, { isBot: true });
    }
    this.persist();
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

    const playerIds = this.seats.map((s) => s.playerId);
    const { state, events } = createGame(playerIds);
    this.gameState = state;
    this.status = 'playing';
    this.startScheduler();
    syncDeadlinesFromState(this.deadlines, state, Date.now());
    this.persist();
    this.fanOutGameEvents(events);
    this.broadcastRoomUpdate();
    this.projectToAll();
    this.syncBotMoves();
    log('info', 'game_started', { roomCode: this.code, playerCount: this.seats.length });
    return { ok: true };
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
    this.syncBotMoves();
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
      this.syncBotMoves();
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
    this.syncBotMoves();
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
    // Hand control back the moment they reconnect, even if a bot move is queued.
    seat.botControlled = false;
    clearDisconnectGrace(this.deadlines, seat.playerId);
    this.syncBotMoves();

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
      } else if (item.kind === 'disconnect') {
        // Seat stays disconnected (windows still resolve via the auto rules
        // above) but a bot policy now plays this seat so the table keeps moving.
        const seat = this.getSeatByPlayerId(item.playerId);
        if (seat && !seat.isBot && !seat.botControlled) {
          seat.botControlled = true;
          log('info', 'bot_takeover', { roomCode: this.code, playerId: item.playerId });
          this.persist();
        }
      }
    }

    if (expired.length > 0) {
      syncDeadlinesFromState(this.deadlines, this.gameState, Date.now());
      this.broadcastRoomUpdate();
      this.syncBotMoves();
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

  private isBotControlled(seat: Seat): boolean {
    return seat.isBot || seat.botControlled;
  }

  private clearBotTimers(): void {
    for (const timer of this.botTimers.values()) clearTimeout(timer);
    this.botTimers.clear();
  }

  /**
   * Re-derives which seats currently owe a move (from `getLegalCommands`, the
   * same source of truth a client's prompt would use) and, for every one that
   * is bot-controlled, queues that bot's move after a random "thinking" pause.
   * Called after every state-changing operation, so a bot's queued move is
   * always for the game state as it stands right now. Rebuilding from scratch
   * each time is deliberate: it is the only way a seat that stops needing a
   * move (a rival paid first, a human reconnected) reliably drops its timer.
   */
  private syncBotMoves(): void {
    this.clearBotTimers();
    if (!this.gameState || this.status !== 'playing') return;

    const actingIds = new Set(getLegalCommands(this.gameState).map((c) => c.playerId));
    const timing = getTimingConfig();
    for (const playerId of actingIds) {
      const seat = this.getSeatByPlayerId(playerId);
      if (!seat || !this.isBotControlled(seat)) continue;
      const delayMs = botThinkingDelayMs(timing);
      const timer = setTimeout(() => {
        this.botTimers.delete(playerId);
        this.runBotMove(playerId);
      }, delayMs);
      this.botTimers.set(playerId, timer);
    }
  }

  /**
   * Plays one command for a bot-controlled seat, through the same
   * dispatch → events → persist → project pipeline any other command uses
   * (`applyEngineCommand`, shared with the scheduler). The bot's own view —
   * `project(state, playerId)` — is all `chooseBotCommand` ever sees; it picks
   * among exactly the commands `getLegalCommands` says are legal for it.
   */
  private runBotMove(playerId: string): void {
    if (!this.gameState || this.status !== 'playing') return;
    const seat = this.getSeatByPlayerId(playerId);
    if (!seat || !this.isBotControlled(seat)) return;

    const legal = getLegalCommands(this.gameState).filter((c) => c.playerId === playerId);
    if (legal.length === 0) return;

    const view = this.buildProjection(playerId);
    const command = chooseBotCommand(view, legal);
    this.applyEngineCommand(command);
  }

  private nextId(): number {
    this.nextEventId += 1;
    return this.nextEventId;
  }

  private fanOutGameEvents(events: GameEvent[]): void {
    for (const event of events) {
      const sanitized = sanitizeGameEvent(event);
      const sseEvent: SseEvent = {
        id: this.nextId(),
        type: 'event',
        event: {
          type: sanitized.type,
          playerId: sanitized.playerId,
          message: sanitized.message,
          data: sanitized.data,
        },
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
    const isBot: Record<string, boolean> = {};
    const botControlled: Record<string, boolean> = {};
    for (const s of this.seats) {
      displayNames[s.playerId] = s.displayName;
      connected[s.playerId] = s.connected;
      isBot[s.playerId] = s.isBot;
      botControlled[s.playerId] = s.botControlled;
    }
    return project(this.gameState, viewerId, {
      displayNames,
      connected,
      isBot,
      botControlled,
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
    this.clearBotTimers();
    for (const client of this.sseClients.values()) {
      stopHeartbeat(client);
      client.res.end();
    }
    this.sseClients.clear();
    this.status = 'abandoned';
  }
}
