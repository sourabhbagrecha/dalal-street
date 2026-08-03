import { randomBytes } from 'node:crypto';

/** Unguessable seat token bound to a room seat (CSPRNG). */
export function generatePlayerToken(): string {
  return randomBytes(32).toString('base64url');
}
