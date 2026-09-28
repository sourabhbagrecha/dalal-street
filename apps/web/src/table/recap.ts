/**
 * A whole-game recap for the victory card: winning sets are shown separately (they are already visible
 * on the winner's own board pips — see `Victory` in kit.tsx). Everything here is derived from data the
 * table already has — the full event log and the final projection — nothing new is tracked server-side.
 * Deliberately reuses `moments/derive.ts` (the same classification the table's callouts and sounds use)
 * rather than re-parsing the log a second way.
 */
import type { ClientGameState } from '@monopoly-deal/shared';
import type { LogEntry } from '../store/types';
import { deriveMoments } from '../moments/derive';
import type { MomentKind } from '../moments/types';

export interface GameRecap {
  /** Turns played, start to finish. */
  turns: number;
  /** Sly Deal, Forced Deal and Deal Breaker plays, across the whole game, by anyone. */
  steals: number;
  /** Just Say No plays, across the whole game, by anyone — an approximation of "saves": a JSN that was
   * itself countered by a further JSN still counts once each way it was played. */
  jsnSaves: number;
  /** The single largest rent charge of the game, or null when nobody ever charged rent. */
  biggestRent: { amount: number; byId: string; fromId: string } | null;
}

const STEAL_KINDS = new Set<MomentKind>(['sly_deal', 'forced_deal', 'deal_breaker']);

export function computeRecap(log: readonly LogEntry[], state: ClientGameState): GameRecap {
  const moments = deriveMoments(log, state, { now: Date.now(), viewerId: state.viewerId, mode: 'network' });
  let steals = 0;
  let jsnSaves = 0;
  let biggestRent: GameRecap['biggestRent'] = null;
  for (const m of moments) {
    if (STEAL_KINDS.has(m.kind)) steals += 1;
    if (m.kind === 'just_say_no') jsnSaves += 1;
    if (m.kind === 'rent' && typeof m.amount === 'number' && (!biggestRent || m.amount > biggestRent.amount)) {
      biggestRent = { amount: m.amount, byId: m.actorId, fromId: m.targetIds[0] ?? '' };
    }
  }
  return { turns: state.turnNumber, steals, jsnSaves, biggestRent };
}
