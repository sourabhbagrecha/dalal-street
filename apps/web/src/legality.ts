import type { ClientGameState } from '@monopoly-deal/shared';

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

/** Wildcards (and same-color naturals) can be dragged between sets only on your own turn, outside interrupts. */
export function canRearrangeProperties(state: ClientGameState, playerId: string): boolean {
  if (state.currentPlayerId !== playerId) return false;
  return state.pendingStack.every((p) => p.kind === 'double_rent_pending');
}

/** A DataTransfer carrying one card id, in the same shape a real HTML5 dragstart builds. */
export function makeCardTransfer(cardId: string): DataTransfer {
  const dataTransfer = new DataTransfer();
  dataTransfer.setData(CARD_MIME, cardId);
  dataTransfer.setData('text/plain', cardId);
  dataTransfer.effectAllowed = 'move';
  return dataTransfer;
}

/** Fires the same `drop` DragEvent a native or touch-polyfilled drag would, so a tap can play a card through the existing onDrop handlers with no new play logic. */
export function dispatchCardDrop(target: Element, dataTransfer: DataTransfer): void {
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
}
