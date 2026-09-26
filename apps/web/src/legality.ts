import type { ClientGameState } from '@monopoly-deal/shared';

export function isDiscardExcessMode(state: ClientGameState, playerId: string): boolean {
  const top = state.pendingStack[state.pendingStack.length - 1];
  return top?.kind === 'hand_limit_discard' && top.playerId === playerId;
}

/** Wildcards (and same-color naturals) can be dragged between sets only on your own turn, outside interrupts. */
export function canRearrangeProperties(state: ClientGameState, playerId: string): boolean {
  if (state.currentPlayerId !== playerId) return false;
  return state.pendingStack.every((p) => p.kind === 'double_rent_pending');
}

/** Fires the same `drop` DragEvent a native or touch-polyfilled drag would, so a tap can play a card through the existing onDrop handlers with no new play logic. */
export function dispatchCardDrop(target: Element, dataTransfer: DataTransfer): void {
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
}
