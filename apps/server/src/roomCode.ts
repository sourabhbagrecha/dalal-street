import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET } from '@monopoly-deal/shared';

const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 100;

export function generateRoomCode(isTaken: (code: string) => boolean): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]!;
    }
    if (!isTaken(code)) return code;
  }
  throw new Error('Failed to generate unique room code');
}
