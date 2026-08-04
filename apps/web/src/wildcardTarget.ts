import type { Card, PropertyColor, PropertySet } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';

const ALL_PROPERTY_COLORS: PropertyColor[] = [
  'brown',
  'light_blue',
  'pink',
  'orange',
  'red',
  'yellow',
  'green',
  'dark_blue',
  'railroad',
  'utility',
];

/**
 * Picks which color a property wildcard should join when the player drops it
 * on the properties panel without specifying one explicitly: prefer an
 * existing incomplete set matching one of the card's colors, otherwise fall
 * back to the card's first color (which starts a new set).
 */
export function pickWildcardColor(card: Card, sets: PropertySet[]): PropertyColor | undefined {
  if (card.kind !== 'property_wild') return undefined;
  const options = card.colors.length === 0 ? ALL_PROPERTY_COLORS : card.colors;
  const existingIncomplete = options.find((c) =>
    sets.some((s) => s.color === c && s.cards.length > 0 && s.cards.length < SET_SIZES[c]),
  );
  return existingIncomplete ?? options[0];
}
