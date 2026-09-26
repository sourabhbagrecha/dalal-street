import type { RoomView } from '@monopoly-deal/shared';
import { theme } from '../theme';

export type RoomSeat = RoomView['seats'][number];

/** 2–5 players per room; the waiting-room table always draws every chair so an open one reads as an invitation. */
export const MAX_SEATS = 5;

/** Where each chair sits on the felt, in % of its width/height: the viewer at the bottom, then round the table. */
export const RING: readonly { x: number; y: number }[] = [
  { x: 50, y: 83 },
  { x: 15, y: 58 },
  { x: 28, y: 17 },
  { x: 72, y: 17 },
  { x: 85, y: 58 },
];

interface PlacedSeat {
  /** Index into `RING`. */
  slot: number;
  /** Null for an open chair. */
  seat: RoomSeat | null;
  you: boolean;
  /** The colour the game table will give this player. */
  color: string;
  ink: string;
}

/**
 * The room's seats as the table will draw them: the viewer first, then everyone else in turn order starting with the
 * player after them (the same rotation `table/live/seats.ts` applies), each in the colour they will wear at the table.
 * Always `MAX_SEATS` long — open chairs are padded on the end.
 */
export function orderSeats(seats: readonly RoomSeat[], viewerId: string | null): PlacedSeat[] {
  const at = seats.findIndex((s) => s.playerId === viewerId);
  const rivals = at < 0 ? [...seats] : [...seats.slice(at + 1), ...seats.slice(0, at)];

  const placed: PlacedSeat[] = [];
  if (at >= 0) {
    placed.push({ slot: 0, seat: seats[at]!, you: true, color: theme.selfColor, ink: theme.selfTextColor });
  }
  rivals.forEach((seat, i) => {
    placed.push({
      slot: placed.length,
      seat,
      you: false,
      color: theme.opponentColor(i),
      ink: theme.opponentTextColor(i),
    });
  });
  while (placed.length < MAX_SEATS) {
    placed.push({ slot: placed.length, seat: null, you: false, color: '', ink: '' });
  }
  return placed.slice(0, MAX_SEATS);
}
