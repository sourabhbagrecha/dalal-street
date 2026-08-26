import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { fixtures, type FixtureName } from '@monopoly-deal/engine';
import {
  chatMessageRequestSchema,
  commandRequestSchema,
  createRoomRequestSchema,
  joinRoomRequestSchema,
  leaveRoomRequestSchema,
  startRoomRequestSchema,
  wireToCommand,
} from '@monopoly-deal/shared';
import { ORIGIN_ALLOWLIST } from './config.js';
import { log } from './logger.js';
import { createDemoRoom, createRoom, deleteRoom, getRoom } from './registry.js';

const FIXTURE_NAME_SET = new Set(Object.keys(fixtures));

const devFixtureRoomRequestSchema = z.object({
  fixtureName: z.string(),
  displayNames: z.array(z.string()).optional(),
});

function roomCodeParam(req: Request): string {
  const code = req.params['code'];
  if (Array.isArray(code)) return code[0] ?? '';
  return code ?? '';
}

function reject(
  res: Response,
  status: number,
  reason: string,
  code:
    | 'validation'
    | 'unauthorized'
    | 'not_found'
    | 'forbidden'
    | 'rejected'
    | 'room_full'
    | 'game_started'
    | 'bad_state',
): void {
  res.status(status).json({ ok: false, reason, code });
}

export function originMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const origin = req.headers.origin;
  if (origin && !ORIGIN_ALLOWLIST.includes(origin)) {
    log('warn', 'origin_rejected', { origin, path: req.path });
    reject(res, 403, 'Origin not allowed', 'forbidden');
    return;
  }
  next();
}

export function createRoutes(): Router {
  const router = Router();

  router.post('/rooms', originMiddleware, (req, res) => {
    const parsed = createRoomRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reject(res, 400, 'Invalid request body', 'validation');
      return;
    }

    const room = createRoom(parsed.data.displayName);
    const host = room.seats[0]!;
    res.json({
      ok: true,
      roomCode: room.code,
      playerToken: host.playerToken,
      playerId: host.playerId,
      isHost: true,
    });
  });

  /**
   * Public room summary — what an invite link (/rooms/:code) needs before the
   * visitor has a seat: status and who is seated. RoomView carries no hidden info.
   * With ?token= it also says whether that token still owns a seat, so a client
   * restoring a stored session can tell "room gone" from "server unreachable".
   */
  router.get('/rooms/:code', originMiddleware, (req, res) => {
    const room = getRoom(roomCodeParam(req));
    if (!room) {
      reject(res, 404, 'Room not found', 'not_found');
      return;
    }
    const token = req.query['token'];
    const seat = typeof token === 'string' ? room.getSeatByToken(token) : undefined;
    res.json({
      ok: true,
      room: room.toRoomView(),
      seat: seat ? { playerId: seat.playerId, isHost: room.isHost(seat.playerId) } : null,
    });
  });

  router.post('/rooms/:code/join', originMiddleware, (req, res) => {
    const parsed = joinRoomRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reject(res, 400, 'Invalid request body', 'validation');
      return;
    }

    const room = getRoom(roomCodeParam(req));
    if (!room) {
      reject(res, 404, 'Room not found', 'not_found');
      return;
    }

    const result = room.join(parsed.data.displayName);
    if (result === 'full') {
      reject(res, 409, 'Room is full', 'room_full');
      return;
    }
    if (result === 'started') {
      reject(res, 409, 'Game already started', 'game_started');
      return;
    }

    room.broadcastRoomUpdate();
    res.json({
      ok: true,
      roomCode: room.code,
      playerToken: result.playerToken,
      playerId: result.playerId,
      isHost: room.isHost(result.playerId),
    });
  });

  router.post('/rooms/:code/leave', originMiddleware, (req, res) => {
    const parsed = leaveRoomRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reject(res, 400, 'Invalid request body', 'validation');
      return;
    }

    const room = getRoom(roomCodeParam(req));
    if (!room) {
      reject(res, 404, 'Room not found', 'not_found');
      return;
    }

    const seatBefore = room.getSeatByToken(parsed.data.playerToken);
    if (!seatBefore) {
      reject(res, 401, 'Unknown player token', 'unauthorized');
      return;
    }

    const empty = room.leave(parsed.data.playerToken);
    if (!empty && room.status !== 'lobby') {
      reject(res, 400, 'Cannot leave after game has started', 'bad_state');
      return;
    }
    if (empty) {
      deleteRoom(room.code);
      res.json({ ok: true });
      return;
    }

    room.broadcastRoomUpdate();
    res.json({ ok: true });
  });

  router.post('/rooms/:code/start', originMiddleware, (req, res) => {
    const parsed = startRoomRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reject(res, 400, 'Invalid request body', 'validation');
      return;
    }

    const room = getRoom(roomCodeParam(req));
    if (!room) {
      reject(res, 404, 'Room not found', 'not_found');
      return;
    }

    const ack = room.start(parsed.data.playerToken);
    res.status(ack.ok ? 200 : ack.code === 'forbidden' ? 403 : 400).json(ack);
  });

  router.post('/rooms/:code/commands', originMiddleware, (req, res) => {
    const parsed = commandRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reject(res, 400, 'Invalid request body', 'validation');
      return;
    }

    const room = getRoom(roomCodeParam(req));
    if (!room) {
      reject(res, 404, 'Room not found', 'not_found');
      return;
    }

    const seat = room.getSeatByToken(parsed.data.playerToken);
    if (!seat) {
      reject(res, 401, 'Unknown player token', 'unauthorized');
      return;
    }

    let command;
    try {
      command = wireToCommand(parsed.data.type, parsed.data.payload, seat.playerId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid command payload';
      reject(res, 400, message, 'validation');
      return;
    }

    const ack = room.dispatchCommand(
      parsed.data.playerToken,
      parsed.data.seq,
      command,
      'client',
    );

    const status = ack.ok
      ? 200
      : ack.code === 'unauthorized'
        ? 401
        : ack.code === 'forbidden'
          ? 403
          : ack.code === 'not_found'
            ? 404
            : 400;
    res.status(status).json(ack);
  });

  router.post('/rooms/:code/chat', originMiddleware, (req, res) => {
    const parsed = chatMessageRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reject(res, 400, 'Invalid request body', 'validation');
      return;
    }

    const room = getRoom(roomCodeParam(req));
    if (!room) {
      reject(res, 404, 'Room not found', 'not_found');
      return;
    }

    const ack = room.postChat(parsed.data.playerToken, parsed.data.text);
    const status = ack.ok
      ? 200
      : ack.code === 'unauthorized'
        ? 401
        : ack.code === 'forbidden'
          ? 403
          : 400;
    res.status(status).json(ack);
  });

  if (process.env['NODE_ENV'] !== 'production') {
    router.post('/dev/rooms/fixture', originMiddleware, (req, res) => {
      const parsed = devFixtureRoomRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        reject(res, 400, 'Invalid request body', 'validation');
        return;
      }
      if (!FIXTURE_NAME_SET.has(parsed.data.fixtureName)) {
        reject(res, 400, 'Unknown fixture name', 'validation');
        return;
      }

      const room = createDemoRoom(
        parsed.data.fixtureName as FixtureName,
        parsed.data.displayNames ?? [],
      );
      room.broadcastRoomUpdate();
      res.json({
        ok: true,
        roomCode: room.code,
        seats: room.seats.map((seat, seatIndex) => ({
          seatIndex,
          playerId: seat.playerId,
          playerToken: seat.playerToken,
          displayName: seat.displayName,
          isHost: room.isHost(seat.playerId),
        })),
      });
    });
  }

  router.get('/rooms/:code/events', originMiddleware, (req, res) => {
    const token = req.query.token;
    if (typeof token !== 'string') {
      reject(res, 400, 'Missing token query parameter', 'validation');
      return;
    }

    const room = getRoom(roomCodeParam(req));
    if (!room) {
      reject(res, 404, 'Room not found', 'not_found');
      return;
    }

    room.connectSse(token, res);
  });

  return router;
}
