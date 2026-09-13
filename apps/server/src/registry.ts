import type { FixtureName } from '@monopoly-deal/engine';
import { generateRoomCode } from './roomCode.js';
import { Room, type PersistedRoom } from './room.js';
import { getTimingConfig } from './config.js';
import { getRoomStore } from './db.js';
import { log } from './logger.js';

const rooms = new Map<string, Room>();
let gcTimer: ReturnType<typeof setInterval> | null = null;

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function createRoom(hostDisplayName: string): Room {
  const code = generateRoomCode((c) => rooms.has(c));
  const room = new Room(code, hostDisplayName);
  rooms.set(code, room);
  room.persist();
  log('info', 'room_created', { roomCode: code });
  return room;
}

/** Dev/test tooling only — see routes.ts's /dev/rooms/fixture, gated to non-production. */
export function createDemoRoom(fixtureName: FixtureName, displayNames: string[]): Room {
  const code = generateRoomCode((c) => rooms.has(c));
  const room = Room.fromFixture(code, fixtureName, displayNames);
  rooms.set(code, room);
  room.persist();
  log('info', 'demo_room_created', { roomCode: code, fixtureName });
  return room;
}

/** Dev/test tooling only — see routes.ts's /dev/rooms/new, gated to non-production. */
export function createFreshRoom(playerCount: number, displayNames: string[]): Room {
  const code = generateRoomCode((c) => rooms.has(c));
  const room = Room.fromFreshDeal(code, playerCount, displayNames);
  rooms.set(code, room);
  room.persist();
  log('info', 'demo_fresh_room_created', { roomCode: code, playerCount });
  return room;
}

export function deleteRoom(code: string): void {
  const room = rooms.get(code);
  if (room) {
    room.destroy();
    rooms.delete(code);
    getRoomStore().remove(code);
    log('info', 'room_gc', { roomCode: code });
  }
}

function isPersistedRoom(value: unknown): value is PersistedRoom {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v['v'] === 1 &&
    typeof v['code'] === 'string' &&
    (v['status'] === 'lobby' || v['status'] === 'playing' || v['status'] === 'finished') &&
    Array.isArray(v['seats']) &&
    Array.isArray(v['chatHistory'])
  );
}

/**
 * Restore every stored room into memory — run once at boot, before the server
 * listens. Rows that are unreadable or already past their GC window are dropped.
 */
export function hydrateRooms(now = Date.now()): number {
  const store = getRoomStore();
  let restored = 0;
  for (const row of store.loadAll()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.snapshot);
    } catch {
      parsed = null;
    }
    if (!isPersistedRoom(parsed) || parsed.code !== row.code) {
      log('warn', 'room_hydrate_skipped', { roomCode: row.code });
      store.remove(row.code);
      continue;
    }
    const room = Room.fromPersisted(parsed, now, row.updatedAt);
    if (room.shouldGc(now)) {
      room.destroy();
      store.remove(row.code);
      log('info', 'room_hydrate_expired', { roomCode: row.code });
      continue;
    }
    rooms.set(room.code, room);
    restored += 1;
  }
  log('info', 'rooms_hydrated', { count: restored });
  return restored;
}

/**
 * Test helper — forget every room in memory without touching the store, the way a
 * process exit would. Pair with hydrateRooms() to simulate a restart.
 */
export function unloadAllRooms(): void {
  for (const room of rooms.values()) room.destroy();
  rooms.clear();
}

function runGc(): void {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.shouldGc(now)) {
      deleteRoom(room.code);
    }
  }
}

export function startRegistryGc(): void {
  if (gcTimer) return;
  const timing = getTimingConfig();
  gcTimer = setInterval(runGc, timing.gcIntervalMs);
}

/** Test helper — clear all rooms. */
export function clearAllRooms(): void {
  for (const code of [...rooms.keys()]) {
    deleteRoom(code);
  }
}
