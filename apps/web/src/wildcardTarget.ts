import type { Card, PropertyColor, PropertySet } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import { jokerHostColors } from '@monopoly-deal/engine';

/**
 * Picks which color a property wildcard should join when the player drops it
 * on the properties panel without specifying one explicitly: prefer an
 * existing incomplete set matching one of the card's colors, otherwise fall
 * back to the card's first color (which starts a new set). The Joker never
 * starts a set, so with none under way it has no color and the play is refused.
 */
function pickWildcardColor(card: Card, sets: PropertySet[]): PropertyColor | undefined {
  if (card.kind !== 'property_wild') return undefined;
  if (card.colors.length === 0) return jokerHostColors(sets)[0];
  const existingIncomplete = card.colors.find((c) =>
    sets.some((s) => s.color === c && s.cards.length > 0 && s.cards.length < SET_SIZES[c]),
  );
  return existingIncomplete ?? card.colors[0];
}

/**
 * The colour an untargeted hand wildcard plays as: the board-aware pick above
 * for any property wildcard, nothing for every other card.
 */
export function resolveWildPlayColor(card: Card, sets: PropertySet[]): PropertyColor | undefined {
  return card.kind === 'property_wild' ? pickWildcardColor(card, sets) : undefined;
}
