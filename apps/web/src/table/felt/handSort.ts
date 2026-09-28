import type { Card, PropertyColor } from '@monopoly-deal/shared';

/**
 * How the hand tray orders its cards. 'dealt' is the server's own order (untouched); 'grouped' clusters cards
 * of a kind together so a wide hand is easier to scan while you wait out someone else's turn. Purely a client-side
 * view: it never reaches the server, never changes a card's identity, and never affects what can legally be played
 * — the same kind of cosmetic-only local state the pending overlay already uses, just with no server round trip
 * involved at all.
 */
export type HandSortMode = 'dealt' | 'grouped';

const COLOR_ORDER: PropertyColor[] = ['brown', 'light_blue', 'pink', 'orange', 'red', 'yellow', 'green', 'dark_blue', 'railroad', 'utility'];

function kindRank(c: Card): number {
  switch (c.kind) {
    case 'money':
      return 0;
    case 'property':
      return 1;
    case 'property_wild':
      return 2;
    case 'rent':
      return 3;
    case 'action':
      return 4;
    default:
      return 5;
  }
}

/** Properties sort by their board colour; everything else ties (falls through to the stable original order). */
function colorRank(c: Card): number {
  return c.kind === 'property' ? COLOR_ORDER.indexOf(c.color) : COLOR_ORDER.length;
}

/**
 * Reorders the viewer's own hand for display only. 'dealt' is a no-op copy (the order the server sent); 'grouped'
 * clusters money first (highest value first, so the biggest bills are easiest to reach for a bank drop), then
 * properties by colour, then wilds, rent and action cards — each group keeping the cards' original relative order
 * (a stable sort) so the layout does not jump around as new cards are drawn into an already-grouped hand.
 */
export function sortHand(cards: readonly Card[], mode: HandSortMode): Card[] {
  if (mode === 'dealt') return [...cards];
  return cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const byKind = kindRank(a.c) - kindRank(b.c);
      if (byKind !== 0) return byKind;
      const byColor = colorRank(a.c) - colorRank(b.c);
      if (byColor !== 0) return byColor;
      if (a.c.kind === 'money' && b.c.kind === 'money') return b.c.amount - a.c.amount;
      return a.i - b.i;
    })
    .map((x) => x.c);
}
