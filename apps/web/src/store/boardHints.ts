import type { Card, PlayerBoard } from '@monopoly-deal/shared';
import { isCompleteSet } from '@monopoly-deal/engine';
import type { StoreSnapshot, StealableOption } from './types';

/**
 * Board hints shared by the network and demo adapters: the empty store snapshot and the
 * client-side heuristics the confirm prompts use before the server has spoken. None of
 * this decides a rule outcome; the server's answer always wins.
 */

/** Complete-set test, identical to the engine's — re-exported rather than copied. */
export { isCompleteSet };

export function emptySnapshot(): StoreSnapshot {
  return {
    clientState: null,
    log: [],
    chatMessages: [],
    rejected: null,
    mode: 'network',
    localSeatIndex: 0,
    room: null,
    isHost: false,
    roomCode: null,
    playerToken: null,
    playerId: null,
    lobbyError: null,
    sseStatus: 'idle',
    staleRoomCode: null,
  };
}

/**
 * Not the engine's `cardPaymentValue`: that values a colourless (multicolour) wild at 0, this keeps face value.
 * Swapping to the engine's is a deliberate future decision, not a drift to fix in passing.
 */
export function cardValue(card: Card): number {
  return card.value;
}

/**
 * Not the engine's `stealableFromBoard`: the engine skips every complete set and offers orphan buildings; this skips
 * complete sets only when they carry a building and skips unassigned multicolour wilds. Swapping is a deliberate future decision.
 */
export function stealableFromBoard(board: PlayerBoard): StealableOption[] {
  const out: StealableOption[] = [];
  for (const set of board.sets) {
    if (set.cards.length === 0) continue;
    if (isCompleteSet(set) && set.house) continue;
    if (isCompleteSet(set) && set.hotel) continue;
    for (const card of set.cards) {
      if (card.kind === 'property_wild' && card.colors.length > 1 && !card.assignedColor) continue;
      out.push({ card });
    }
  }
  return out;
}
