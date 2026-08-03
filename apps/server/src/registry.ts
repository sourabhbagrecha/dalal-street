import { generateRoomCode } from './roomCode.js';
import { Room } from './room.js';
import { getTimingConfig } from './config.js';
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
  log('info', 'room_created', { roomCode: code });
  return room;
}

export function deleteRoom(code: string): void {
  const room = rooms.get(code);
  if (room) {
    room.destroy();
    rooms.delete(code);
    log('info', 'room_gc', { roomCode: code });
  }
}

export function listRooms(): Room[] {
  return [...rooms.values()];
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

export function stopRegistryGc(): void {
  if (gcTimer) {
    clearInterval(gcTimer);
    gcTimer = null;
  }
}

/** Test helper — clear all rooms. */
export function clearAllRooms(): void {
  for (const code of [...rooms.keys()]) {
    deleteRoom(code);
  }
}
