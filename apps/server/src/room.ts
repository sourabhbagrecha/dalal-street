import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import {
  createGame,
  dispatch,
  project,
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
  type CommandAck,
  type SseEvent,
} from '@monopoly-deal/shared';
import { getTimingConfig } from './config.js';
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
const SCHEDULER_ONLY = new Set([
  'FORCE_END_TURN',
  'AUTO_RESOLVE_PENDING',
  'PLAYER_CONNECTION_CHANGED',
]);

export type RoomStatus = 'lobby' | 'playing' | 'finished' | 'abandoned';

export interface Seat {
  playerId: string;
  displayName: string;
  playerToken: string;
  connected: boolean;
  appliedSeq: Set<number>;
  lastSeq: number;
}

export class Room {
  readonly code: string;
  status: RoomStatus = 'lobby';
  readonly seats: Seat[] = [];
  hostPlayerId: string;
  gameState: GameState | null = null;
  readonly deadlines: RoomDeadlines = createRoomDeadlines();
  readonly sseClients = new Map<string, SseClient>();
  private nextEventId = 0;
  private lastSocketActivityAt = Date.now();
  private finishedAt: number | null = null;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;

  constructor(code: string, hostDisplayName: string) {
    this.code = code;
    const host = this.addSeat(hostDisplayName);
    this.hostPlayerId = host.playerId;
  }

  private addSeat(displayName: string): Seat {
    const seat: Seat = {
      playerId: `p_${randomBytes(8).toString('hex')}`,
      displayName,
      playerToken: generatePlayerToken(),
      connected: false,
      appliedSeq: new Set(),
      lastSeq: -1,
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
      })),
    };
  }

  join(displayName: string): Seat | 'full' | 'started' {
    if (this.status !== 'lobby') return 'started';
    if (this.seats.length >= MAX_SEATS) return 'full';
    return this.addSeat(displayName);
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
    this.fanOutGameEvents(events);
    this.broadcastRoomUpdate();
    this.projectToAll();
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

    this.projectToAll();
  }

  dispatchSchedulerCommand(command: Command): void {
    this.applyEngineCommand(command);
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
      this.handleSseDisconnect(playerToken);
    });

    res.on('close', () => {
      this.handleSseDisconnect(playerToken);
    });
  }

  private handleSseDisconnect(playerToken: string): void {
    const client = this.sseClients.get(playerToken);
    if (!client) return;

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

    const actor =
      top.kind === 'payment'
        ? top.payerId
        : top.kind === 'just_say_no'
          ? top.respondentId
          : top.kind === 'hand_limit_discard'
            ? top.playerId
            : 'actorId' in top
              ? top.actorId
              : null;
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
