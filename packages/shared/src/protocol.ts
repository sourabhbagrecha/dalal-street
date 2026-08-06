import { z } from 'zod';
import type { Command, GameEvent } from './types.js';

export const PROTOCOL_VERSION = 1 as const;

/** Unambiguous room-code alphabet (no O/0/I/1). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const roomCodeSchema = z
  .string()
  .length(6)
  .regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);

export const playerTokenSchema = z.string().min(32).max(128);

const propertyColorSchema = z.enum([
  'brown',
  'light_blue',
  'pink',
  'orange',
  'red',
  'yellow',
  'green',
  'dark_blue',
  'railroad',
  'utility',
]);

const playZoneSchema = z.enum(['bank', 'property', 'discard']);

const playTargetSchema = z
  .object({
    assignedColor: propertyColorSchema.optional(),
    setId: z.string().optional(),
    targetPlayerId: z.string().optional(),
    ownCardId: z.string().optional(),
    targetCardId: z.string().optional(),
    targetSetId: z.string().optional(),
    rentColor: propertyColorSchema.optional(),
  })
  .strict();

/** Engine command types accepted over the wire (Phase 1 adds scheduler commands). */
export const wireCommandTypeSchema = z.enum([
  'DRAW_TURN_CARDS',
  'PLAY_CARD',
  'SELECT_PAYMENT',
  'RESPOND_JUST_SAY_NO',
  'DECLINE_JUST_SAY_NO',
  'REARRANGE_PROPERTY',
  'DISCARD_EXCESS',
  'END_TURN',
  'SELECT_RENT_COLOR',
  'SELECT_RENT_PLAYER',
  'SELECT_DEBT_COLLECTOR_PLAYER',
  'SELECT_STEAL_TARGET',
  'SELECT_BUILDING_SET',
  'FORCE_END_TURN',
  'AUTO_RESOLVE_PENDING',
  'PLAYER_CONNECTION_CHANGED',
]);

export type WireCommandType = z.infer<typeof wireCommandTypeSchema>;

/**
 * Command POST body. `playerId` is never trusted from the client —
 * the server binds the acting seat from `playerToken`.
 */
export const commandRequestSchema = z
  .object({
    v: z.literal(PROTOCOL_VERSION),
    playerToken: playerTokenSchema,
    seq: z.number().int().nonnegative(),
    type: wireCommandTypeSchema,
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const commandAckOkSchema = z
  .object({
    ok: z.literal(true),
    /** True when this (playerToken, seq) was already applied. */
    duplicate: z.boolean().optional(),
  })
  .strict();

export const commandAckRejectSchema = z
  .object({
    ok: z.literal(false),
    reason: z.string(),
    code: z
      .enum([
        'validation',
        'unauthorized',
        'not_found',
        'forbidden',
        'rejected',
        'room_full',
        'game_started',
        'bad_state',
      ])
      .optional(),
  })
  .strict();

export const commandAckSchema = z.discriminatedUnion('ok', [
  commandAckOkSchema,
  commandAckRejectSchema,
]);

export type CommandAck = z.infer<typeof commandAckSchema>;

/** Lobby: create room */
export const createRoomRequestSchema = z
  .object({
    v: z.literal(PROTOCOL_VERSION),
    displayName: z.string().trim().min(1).max(24),
  })
  .strict();

/** Lobby: join room */
export const joinRoomRequestSchema = z
  .object({
    v: z.literal(PROTOCOL_VERSION),
    displayName: z.string().trim().min(1).max(24),
  })
  .strict();

export const startRoomRequestSchema = z
  .object({
    v: z.literal(PROTOCOL_VERSION),
    playerToken: playerTokenSchema,
  })
  .strict();

export const leaveRoomRequestSchema = z
  .object({
    v: z.literal(PROTOCOL_VERSION),
    playerToken: playerTokenSchema,
  })
  .strict();

export const roomSeatSchema = z
  .object({
    playerId: z.string(),
    displayName: z.string(),
    connected: z.boolean(),
    isHost: z.boolean(),
  })
  .strict();

export const roomViewSchema = z
  .object({
    code: roomCodeSchema,
    status: z.enum(['lobby', 'playing', 'finished', 'abandoned']),
    seats: z.array(roomSeatSchema),
    hostPlayerId: z.string(),
  })
  .strict();

export type RoomView = z.infer<typeof roomViewSchema>;

export const CHAT_MESSAGE_MAX_LEN = 200;

export const chatMessageRequestSchema = z
  .object({
    v: z.literal(PROTOCOL_VERSION),
    playerToken: playerTokenSchema,
    text: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_LEN),
  })
  .strict();

export const chatMessageSchema = z
  .object({
    id: z.number().int().positive(),
    playerId: z.string(),
    displayName: z.string(),
    text: z.string(),
    sentAt: z.number().int(),
  })
  .strict();

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const sseProjectionEventSchema = z
  .object({
    id: z.number().int().positive(),
    type: z.literal('projection'),
    state: z.unknown(), // ClientGameState; validated structurally by client types
  })
  .strict();

export const sseGameEventSchema = z
  .object({
    id: z.number().int().positive(),
    type: z.literal('event'),
    event: z.object({
      type: z.string(),
      playerId: z.string().optional(),
      message: z.string(),
      data: z.record(z.string(), z.unknown()).optional(),
    }),
  })
  .strict();

export const sseRoomUpdateEventSchema = z
  .object({
    id: z.number().int().positive(),
    type: z.literal('roomUpdate'),
    room: roomViewSchema,
  })
  .strict();

export const sseErrorEventSchema = z
  .object({
    id: z.number().int().positive(),
    type: z.literal('error'),
    reason: z.string(),
    code: z.string().optional(),
  })
  .strict();

export const sseChatEventSchema = z
  .object({
    id: z.number().int().positive(),
    type: z.literal('chat'),
    message: chatMessageSchema,
  })
  .strict();

export const sseEventSchema = z.discriminatedUnion('type', [
  sseProjectionEventSchema,
  sseGameEventSchema,
  sseRoomUpdateEventSchema,
  sseErrorEventSchema,
  sseChatEventSchema,
]);

export type SseEvent = z.infer<typeof sseEventSchema>;
/**
 * Map a validated wire request into an engine Command, binding `playerId` from the seat token.
 * Scheduler-only commands are included for completeness; clients should not send them.
 */
export function wireToCommand(
  type: WireCommandType,
  payload: Record<string, unknown>,
  playerId: string,
): Command {
  switch (type) {
    case 'DRAW_TURN_CARDS':
      return { type: 'DRAW_TURN_CARDS', playerId };
    case 'PLAY_CARD': {
      const parsed = z
        .object({
          cardId: z.string(),
          zone: playZoneSchema,
          target: playTargetSchema.optional(),
        })
        .strict()
        .parse(payload);
      return {
        type: 'PLAY_CARD',
        playerId,
        cardId: parsed.cardId,
        zone: parsed.zone,
        target: parsed.target,
      };
    }
    case 'SELECT_PAYMENT': {
      const parsed = z
        .object({ cardIds: z.array(z.string()) })
        .strict()
        .parse(payload);
      return { type: 'SELECT_PAYMENT', playerId, cardIds: parsed.cardIds };
    }
    case 'RESPOND_JUST_SAY_NO': {
      const parsed = z.object({ cardId: z.string() }).strict().parse(payload);
      return { type: 'RESPOND_JUST_SAY_NO', playerId, cardId: parsed.cardId };
    }
    case 'DECLINE_JUST_SAY_NO':
      return { type: 'DECLINE_JUST_SAY_NO', playerId };
    case 'REARRANGE_PROPERTY': {
      const parsed = z
        .object({
          cardId: z.string(),
          toColor: propertyColorSchema,
          toSetId: z.string().optional(),
        })
        .strict()
        .parse(payload);
      return {
        type: 'REARRANGE_PROPERTY',
        playerId,
        cardId: parsed.cardId,
        toColor: parsed.toColor,
        toSetId: parsed.toSetId,
      };
    }
    case 'DISCARD_EXCESS': {
      const parsed = z
        .object({ cardIds: z.array(z.string()) })
        .strict()
        .parse(payload);
      return { type: 'DISCARD_EXCESS', playerId, cardIds: parsed.cardIds };
    }
    case 'END_TURN':
      return { type: 'END_TURN', playerId };
    case 'SELECT_RENT_COLOR': {
      const parsed = z
        .object({ color: propertyColorSchema })
        .strict()
        .parse(payload);
      return { type: 'SELECT_RENT_COLOR', playerId, color: parsed.color };
    }
    case 'SELECT_RENT_PLAYER': {
      const parsed = z
        .object({ targetPlayerId: z.string() })
        .strict()
        .parse(payload);
      return {
        type: 'SELECT_RENT_PLAYER',
        playerId,
        targetPlayerId: parsed.targetPlayerId,
      };
    }
    case 'SELECT_DEBT_COLLECTOR_PLAYER': {
      const parsed = z
        .object({ targetPlayerId: z.string() })
        .strict()
        .parse(payload);
      return {
        type: 'SELECT_DEBT_COLLECTOR_PLAYER',
        playerId,
        targetPlayerId: parsed.targetPlayerId,
      };
    }
    case 'SELECT_STEAL_TARGET': {
      const parsed = z
        .object({
          targetCardId: z.string().optional(),
          targetSetId: z.string().optional(),
          ownCardId: z.string().optional(),
        })
        .strict()
        .parse(payload);
      return {
        type: 'SELECT_STEAL_TARGET',
        playerId,
        targetCardId: parsed.targetCardId,
        targetSetId: parsed.targetSetId,
        ownCardId: parsed.ownCardId,
      };
    }
    case 'SELECT_BUILDING_SET': {
      const parsed = z.object({ setId: z.string() }).strict().parse(payload);
      return { type: 'SELECT_BUILDING_SET', playerId, setId: parsed.setId };
    }
    case 'FORCE_END_TURN':
      return { type: 'FORCE_END_TURN', playerId };
    case 'AUTO_RESOLVE_PENDING':
      return { type: 'AUTO_RESOLVE_PENDING', playerId };
    case 'PLAYER_CONNECTION_CHANGED': {
      const parsed = z.object({ connected: z.boolean() }).strict().parse(payload);
      return {
        type: 'PLAYER_CONNECTION_CHANGED',
        playerId,
        connected: parsed.connected,
      };
    }
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown wire command type: ${_exhaustive}`);
    }
  }
}

/** Sanitize a game event before SSE fan-out (strip seed / deck / hand payloads). */
export function sanitizeGameEvent(event: GameEvent): GameEvent {
  if (!event.data) return event;
  const data = { ...event.data };
  delete data.seed;
  delete data.deck;
  delete data.hand;
  delete data.hands;
  return { ...event, data };
}
