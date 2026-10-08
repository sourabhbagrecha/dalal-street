import type { ClientGameState, ClientPlayerPublic, PropertySet } from '@monopoly-deal/shared';
import { selfOf } from '@monopoly-deal/shared';
import { nameFor } from '../../derivations';
import { theme } from '../../theme';
import type { Seat } from '../model';
import { isComplete, setSize } from '../model';

/**
 * Everyone but the viewer, in turn order starting with the player after them
 * (the table's seating is a ring, so this is the players array rotated).
 */
export function rivalsInTurnOrder(state: ClientGameState): ClientPlayerPublic[] {
  const at = state.players.findIndex((p) => p.id === state.viewerId);
  if (at < 0) return state.players.filter((p) => p.id !== state.viewerId);
  return [...state.players.slice(at + 1), ...state.players.slice(0, at)];
}

/** Closest to done first: complete sets, then by share filled (2/3 before 1/3 before 1/4); equal shares keep the order they were laid. */
function byCompletion(sets: PropertySet[]): PropertySet[] {
  const share = (s: PropertySet) => (isComplete(s) ? Infinity : s.cards.length / setSize(s.color));
  return [...sets].sort((a, b) => share(b) - share(a));
}

/** The viewer's seat and their rivals' seats, as the table draws them. */
export function buildSeats(state: ClientGameState): { me: Seat; rivals: Seat[] } {
  const you = selfOf(state);
  const me: Seat = {
    id: you.id,
    name: 'You',
    color: theme.selfColor,
    ink: theme.selfTextColor,
    handCount: you.hand.length,
    connected: you.connected,
    bank: you.board.bank,
    sets: you.board.sets,
  };
  const rivals = rivalsInTurnOrder(state).map(
    (p, i): Seat => ({
      id: p.id,
      name: nameFor(state, p.id),
      color: theme.opponentColor(i),
      ink: theme.opponentTextColor(i),
      handCount: p.handCount,
      connected: p.connected,
      bank: p.board.bank,
      sets: byCompletion(p.board.sets),
      graceMs: state.deadlines?.disconnectGraceMs?.[p.id],
    }),
  );
  return { me, rivals };
}
