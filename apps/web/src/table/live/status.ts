import type { ClientGameState } from '@monopoly-deal/shared';
import { nameFor } from '../../derivations';
import type { Prompt } from '../model';
import { topPending } from './prompts';

/** "Priya", "Priya, Yuki" — a name list without repeats. */
const names = (state: ClientGameState, ids: string[]): string => [...new Set(ids)].map((id) => nameFor(state, id)).join(', ');

/**
 * What the viewer is waiting on while a RIVAL owes a choice or a payment, in a short human line; null when the viewer
 * owes something themselves (the prompt says so) or nothing is pending on anyone else.
 */
export function deriveWait(state: ClientGameState, prompt: Prompt | null): string | null {
  if (prompt || state.winnerId) return null;
  const top = topPending(state);
  if (!top) return null;
  const viewer = state.viewerId;
  const who = (id: string) => nameFor(state, id);

  switch (top.kind) {
    case 'payment':
      return top.payerId === viewer ? null : `Waiting on ${who(top.payerId)} to pay`;
    case 'payment_round': {
      const responders: string[] = [];
      const payers: string[] = [];
      for (const e of top.entries) {
        if (e.phase === 'jsn' && e.jsn && e.jsn.respondentId !== viewer) responders.push(e.jsn.respondentId);
        else if (e.phase === 'payment' && e.payerId !== viewer) payers.push(e.payerId);
      }
      if (responders.length > 0) return `${names(state, responders)} may Just Say No…`;
      if (payers.length > 0) return `Waiting on ${names(state, payers)} to pay`;
      return null;
    }
    case 'just_say_no':
      return top.respondentId === viewer ? null : `${who(top.respondentId)} may Just Say No…`;
    case 'hand_limit_discard':
      return top.playerId === viewer ? null : `${who(top.playerId)} is discarding`;
    case 'sly_deal_target':
      return top.actorId === viewer ? null : `${who(top.actorId)} is choosing a property to take…`;
    case 'forced_deal_target':
      return top.actorId === viewer ? null : `${who(top.actorId)} is choosing a swap…`;
    case 'deal_breaker_target':
      return top.actorId === viewer ? null : `${who(top.actorId)} is choosing a set to take…`;
    case 'debt_collector_target':
    case 'rent_player_choice':
      return top.actorId === viewer ? null : `${who(top.actorId)} is choosing who pays…`;
    case 'rent_color_choice':
      return top.actorId === viewer ? null : `${who(top.actorId)} is choosing what to charge rent on…`;
    case 'house_hotel_target':
      return top.actorId === viewer ? null : `${who(top.actorId)} is placing a ${top.building}…`;
    case 'double_rent_pending':
      return null;
  }
}

/** The fixed server window for the top pending entry, in seconds; null when it has none (the turn clock runs instead). */
export function pendingWindowSecs(state: ClientGameState): number | null {
  const top = topPending(state);
  if (!top) return null;
  switch (top.kind) {
    case 'just_say_no':
      return 20;
    case 'payment':
      return 30;
    case 'payment_round':
      return top.entries.some((e) => e.phase === 'jsn' && e.jsn) ? 20 : 30;
    case 'hand_limit_discard':
    case 'double_rent_pending':
      return null;
    default:
      return 30;
  }
}

export const TURN_SECS = 60;
