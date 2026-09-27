import { describe, expect, it } from 'vitest';
import { theme } from '../theme';
import { MAX_SEATS, orderSeats, type RoomSeat } from './seatRing';

const seat = (id: string, isHost = false): RoomSeat => ({
  playerId: id,
  displayName: id.toUpperCase(),
  connected: true,
  isHost,
  rematchReady: false,
});

describe('orderSeats', () => {
  it('always returns every chair, open ones last', () => {
    const placed = orderSeats([seat('a', true), seat('b')], 'a');
    expect(placed).toHaveLength(MAX_SEATS);
    expect(placed.map((p) => p.seat?.playerId ?? null)).toEqual(['a', 'b', null, null, null]);
    expect(placed.map((p) => p.slot)).toEqual([0, 1, 2, 3, 4]);
  });

  it('puts the viewer first and rotates the rest into turn order after them', () => {
    const placed = orderSeats([seat('a', true), seat('b'), seat('c'), seat('d')], 'c');
    expect(placed.map((p) => p.seat?.playerId ?? null)).toEqual(['c', 'd', 'a', 'b', null]);
    expect(placed[0]!.you).toBe(true);
    expect(placed.slice(1).some((p) => p.you)).toBe(false);
  });

  it('colours seats the way the table will', () => {
    const placed = orderSeats([seat('a'), seat('b'), seat('c')], 'b');
    expect(placed[0]!.color).toBe(theme.selfColor);
    expect(placed[1]!.color).toBe(theme.opponentColor(0));
    expect(placed[2]!.color).toBe(theme.opponentColor(1));
    expect(placed[1]!.ink).toBe(theme.opponentTextColor(0));
  });

  it('still lists everyone when the viewer is not seated yet', () => {
    const placed = orderSeats([seat('a'), seat('b')], null);
    expect(placed.map((p) => p.seat?.playerId ?? null)).toEqual(['a', 'b', null, null, null]);
    expect(placed.some((p) => p.you)).toBe(false);
  });
});
