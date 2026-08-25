import type { ClientGameState } from '@monopoly-deal/shared';

/**
 * Whether the given player has something on the pending stack demanding
 * their action right now — a rent/birthday payment, a Just Say No response,
 * their own hand-limit discard, or (as the turn's actor) a target/choice
 * pick still to make. These can all land on a player who isn't the current
 * turn's owner (a rent payment is the common case: it's the actor's turn,
 * but a DIFFERENT seat owes money). Mirrors the split GamePrompts.tsx uses
 * internally (pendingForLocal + PaymentRoundPrompts' per-entry filtering) —
 * duplicated here rather than imported since that file is out of this fix's
 * scope to edit, and the shape it reads (ClientPendingInteraction) is a
 * stable shared type.
 *
 * Used to keep the local pass-and-play hand-off curtain from covering a
 * prompt the currently-seated player still needs to see and act on, even
 * though the engine says it isn't nominally their "turn".
 */
export function viewerHasPendingPrompt(clientState: ClientGameState, playerId: string): boolean {
  const top = clientState.pendingStack[clientState.pendingStack.length - 1];
  if (!top) return false;

  if (top.kind === 'payment_round') {
    return top.entries.some((e) => {
      if (e.phase === 'jsn') return e.jsn?.respondentId === playerId;
      if (e.phase === 'payment') return e.payerId === playerId;
      return false;
    });
  }

  switch (top.kind) {
    case 'payment':
      return top.payerId === playerId;
    case 'just_say_no':
      return top.respondentId === playerId;
    case 'hand_limit_discard':
      return top.playerId === playerId;
    case 'rent_color_choice':
    case 'rent_player_choice':
    case 'debt_collector_target':
    case 'sly_deal_target':
    case 'forced_deal_target':
    case 'deal_breaker_target':
    case 'house_hotel_target':
      return top.actorId === playerId;
    default:
      return false;
  }
}
