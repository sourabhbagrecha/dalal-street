import type { ClientGameState } from '@monopoly-deal/shared';
import { theme } from '../theme';

/**
 * Local pass-and-play only: a seat's stable identity, independent of who
 * currently holds the phone. `derivations.ts`'s `nameFor`/`playerDisplayName`
 * special-case the *viewer's own* seat as "You" — exactly wrong for the
 * hand-off curtain and the on-board seat chip, since every seat is "You" to
 * whoever is currently viewing it. These need the seat's actual assigned
 * name regardless of who's looking.
 */
export function seatIdentityName(clientState: ClientGameState, seatIndex: number): string {
  const player = clientState.players[seatIndex];
  if (player?.displayName) return player.displayName;
  return theme.seatName(seatIndex, false);
}
