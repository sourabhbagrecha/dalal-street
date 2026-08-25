import type { Card } from '@monopoly-deal/shared';
import { buildDeck } from '@monopoly-deal/engine';

/**
 * The deck as reference material for `/rules`, grouped by printed face.
 *
 * This is the one place the client reads the engine's deck rather than a
 * server projection, and it is not game state: `buildDeck()` is a pure
 * catalogue of what the 110 cards are, identical in every game and secret
 * from nobody. Deriving the rules page from it instead of a hand-written
 * list is what stops the page drifting from the deck actually dealt.
 */

export interface DeckEntry {
  /** Stable per-face id — also the page's test id suffix. */
  key: string;
  /** Every physical copy of this face in the deck; `[0]` is the one shown collapsed. */
  cards: Card[];
}

/** Two cards share a key when the deck prints them identically. */
function faceKey(card: Card): string {
  switch (card.kind) {
    case 'money':
      return `money-${card.amount}`;
    case 'property':
      return `property-${card.color}-${card.name}`;
    case 'property_wild':
      return `wild-${card.colors.join('-') || 'multi'}`;
    case 'action':
      return `action-${card.action}`;
    case 'rent':
      return `rent-${card.colors.join('-') || 'wild'}`;
    default:
      return 'rule';
  }
}

export interface DeckReference {
  /** The full deck, in build order. */
  cards: Card[];
  /** Faces keyed by `faceKey`, in build order. */
  groups: Map<string, DeckEntry>;
}

export function buildDeckReference(): DeckReference {
  const cards = buildDeck();
  const groups = new Map<string, DeckEntry>();
  for (const card of cards) {
    const key = faceKey(card);
    const entry = groups.get(key);
    if (entry) entry.cards.push(card);
    else groups.set(key, { key, cards: [card] });
  }
  return { cards, groups };
}
