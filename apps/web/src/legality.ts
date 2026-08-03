import type { ClientGameState, PlayZone } from '@monopoly-deal/shared';

const CARD_MIME = 'application/x-monopoly-card';

export { CARD_MIME };

/** Prefer custom MIME; fall back to text/plain for broader browser DnD support. */
export function readDraggedCardId(dataTransfer: DataTransfer): string {
  return dataTransfer.getData(CARD_MIME) || dataTransfer.getData('text/plain');
}

export function isDiscardExcessMode(state: ClientGameState, playerId: string): boolean {
  const top = state.pendingStack[state.pendingStack.length - 1];
  return top?.kind === 'hand_limit_discard' && top.playerId === playerId;
}

export function allPlayZones(): PlayZone[] {
  return ['bank', 'property', 'discard'];
}
