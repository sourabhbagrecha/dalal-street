/**
 * A player whose tab is reclaimed by the OS must be able to get back into a
 * running game. The server already tracks a 60s disconnect grace window per
 * seat; join() honours it instead of flatly answering "Game already started".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Room } from './room.js';
import { startDisconnectGrace } from './scheduler.js';
import { resetTimingConfig } from './config.js';

function startedRoom(): { room: Room; hostToken: string } {
  const room = new Room('ABCDEF', 'Alice');
  const bob = room.join('Bob');
  if (typeof bob === 'string') throw new Error('join failed');
  const hostToken = room.seats[0]!.playerToken;
  const ack = room.start(hostToken);
  expect(ack.ok).toBe(true);
  return { room, hostToken };
}

describe('rejoin during disconnect grace', () => {
  afterEach(() => {
    resetTimingConfig();
  });

  it('returns the original seat to a disconnected player inside the grace window', () => {
    const { room } = startedRoom();
    const bobSeat = room.seats[1]!;
    const originalToken = bobSeat.playerToken;

    bobSeat.connected = false;
    startDisconnectGrace(room.deadlines, bobSeat.playerId, Date.now());

    const result = room.join('Bob');
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.playerId).toBe(bobSeat.playerId);
    expect(result.playerToken).toBe(originalToken);
    room.destroy();
  });

  it('still refuses a stranger joining a running game', () => {
    const { room } = startedRoom();
    const bobSeat = room.seats[1]!;
    bobSeat.connected = false;
    startDisconnectGrace(room.deadlines, bobSeat.playerId, Date.now());

    expect(room.join('Mallory')).toBe('started');
    room.destroy();
  });

  it('refuses once the grace window has lapsed', () => {
    const { room } = startedRoom();
    const bobSeat = room.seats[1]!;
    bobSeat.connected = false;
    // No grace entry == the window already expired and was collected.
    expect(room.join('Bob')).toBe('started');
    room.destroy();
  });

  it('refuses to hand over a seat that is still connected', () => {
    const { room } = startedRoom();
    const bobSeat = room.seats[1]!;
    bobSeat.connected = true;
    startDisconnectGrace(room.deadlines, bobSeat.playerId, Date.now());

    expect(room.join('Bob')).toBe('started');
    room.destroy();
  });
});
