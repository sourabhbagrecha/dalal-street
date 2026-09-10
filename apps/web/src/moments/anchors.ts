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
 * Board anchor for a player's properties: the viewer's own drop zone, an
 * opponent's rail card, the opponent-spotlight stage (only when this player
 * has no rail card of their own — i.e. they're the one currently spotlit),
 * or their peer chip.
 */
export function anchorRectFor(playerId: string, viewerId: string): DOMRect | null {
  if (playerId === viewerId) {
    return rectOf('[data-testid="properties-drop"]');
  }
  const card = rectOf(`[data-testid="opponent-card-${playerId}"]`);
  if (card) return card;

  const peer = document.querySelector<HTMLElement>(`[data-testid="opponent-peer-${playerId}"]`);
  if (!peer) {
    // Spotlight layout renders exactly one opponent as the un-peer'd stage —
    // by elimination, that's this player.
    const spotlight = rectOf('[data-testid="opponent-spotlight"]');
    if (spotlight) return spotlight;
  } else {
    return peer.getBoundingClientRect();
  }
  return null;
}

/** Bank anchor for a player: the viewer's cash pile, an opponent's bank total, or the spotlight's. */
export function bankAnchorRectFor(playerId: string, viewerId: string): DOMRect | null {
  if (playerId === viewerId) {
    return rectOf('[data-testid="bank-drop"]');
  }
  const bank = rectOf(`[data-testid="opponent-bank-${playerId}"]`);
  if (bank) return bank;
  return rectOf(`[data-testid="bank-drop-${playerId}"]`);
}
