/**
 * Pure DOM anchor lookups for card flights — see the brief's "Flights"
 * paragraph for the selector fallback order. Returns `null` when nothing
 * matches; the caller (`useTableMoments`) skips that flight rather than
 * fabricating a position.
 */
function rectOf(selector: string): DOMRect | null {
  return document.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
}

/**
 * Board anchor for a player's properties: the viewer's own drop zone, the
 * table stage when that opponent is the one currently on it, or their rim
 * seat otherwise.
 */
export function anchorRectFor(playerId: string, viewerId: string): DOMRect | null {
  if (playerId === viewerId) {
    return rectOf('[data-testid="properties-drop"]');
  }
  const staged = rectOf(`[data-testid="opponent-spotlight"][data-player-id="${playerId}"]`);
  if (staged) return staged;

  return rectOf(`[data-testid="opponent-peer-${playerId}"]`);
}

/** Bank anchor for a player: the viewer's cash pile, the staged opponent's pile, or their rim seat. */
export function bankAnchorRectFor(playerId: string, viewerId: string): DOMRect | null {
  if (playerId === viewerId) {
    return rectOf('[data-testid="bank-drop"]');
  }
  const staged = rectOf(`[data-testid="bank-drop-${playerId}"]`);
  if (staged) return staged;
  // Off-stage opponents only show their bank as the chip stack on their rim seat.
  return rectOf(`[data-testid="opponent-peer-${playerId}"]`);
}
