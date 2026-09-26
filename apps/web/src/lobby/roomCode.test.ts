import { describe, expect, it } from 'vitest';
import { normalizeRoomCode } from './roomCode';

describe('normalizeRoomCode', () => {
  it('upper-cases and caps at six characters', () => {
    expect(normalizeRoomCode('k7pq2m')).toBe('K7PQ2M');
    expect(normalizeRoomCode('abcdefgh')).toBe('ABCDEF');
  });

  it('drops characters no room code contains', () => {
    // I, O, 0 and 1 are not in the alphabet; punctuation and spaces never are.
    expect(normalizeRoomCode('a-b c!0O1I')).toBe('ABC');
  });

  it('takes the code out of a pasted invite link', () => {
    expect(normalizeRoomCode('https://deal.example/rooms/k7pq2m')).toBe('K7PQ2M');
    expect(normalizeRoomCode('http://127.0.0.1:5173/rooms/ABC234?from=chat')).toBe('ABC234');
  });

  it('is empty for nothing usable', () => {
    expect(normalizeRoomCode('')).toBe('');
    expect(normalizeRoomCode('0101')).toBe('');
  });
});
