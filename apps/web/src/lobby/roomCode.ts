import { ROOM_CODE_ALPHABET } from '@monopoly-deal/shared';

export const ROOM_CODE_LENGTH = 6;

/**
 * Whatever a player typed or pasted, as the code it could be: upper-case, only characters a code can contain, at
 * most six. A whole invite link pasted into the box yields its room code (`…/rooms/k7pq2m` → `K7PQ2M`).
 */
export function normalizeRoomCode(raw: string): string {
  const fromLink = /\/rooms\/([A-Za-z0-9]+)/.exec(raw)?.[1];
  return [...(fromLink ?? raw).toUpperCase()]
    .filter((ch) => ROOM_CODE_ALPHABET.includes(ch))
    .slice(0, ROOM_CODE_LENGTH)
    .join('');
}
