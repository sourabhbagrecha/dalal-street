import type { Card, PlayerBoard, PropertySet } from '@monopoly-deal/shared';
import { isMulticolorWild } from './prompts';

const byValue = (a: Card, b: Card): number => a.value - b.value || a.id.localeCompare(b.id);

/** A set's payable cards: its properties, house and hotel. */
const cardsOf = (set: PropertySet): Card[] => [...set.cards, ...(set.house ? [set.house] : []), ...(set.hotel ? [set.hotel] : [])];

/**
 * A cheap payment for the viewer, mirroring the server's auto-pay: bank first, then properties from unfinished sets,
 * and cards of a completed set only when there is no way around it — cheapest first within each group; the
 * multicolour wildcard is never payable. Cards are taken in that order until the store's `validate` says the
 * selection settles the debt, then any card the debt no longer needs is handed back, dearest first. When the debt is
 * bigger than everything the viewer owns, that is every payable card (which `validate` accepts).
 */
export function autoPaySelection(
  board: PlayerBoard,
  isCompleteSet: (set: PropertySet) => boolean,
  validate: (cardIds: string[]) => boolean,
): string[] {
  if (validate([])) return [];

  const payable = (cards: Card[]) => cards.filter((c) => !isMulticolorWild(c)).sort(byValue);
  const order = [
    ...payable(board.bank),
    ...payable(board.sets.filter((s) => !isCompleteSet(s)).flatMap(cardsOf)),
    ...payable(board.sets.filter((s) => isCompleteSet(s)).flatMap(cardsOf)),
  ];

  const picked: Card[] = [];
  for (const card of order) {
    picked.push(card);
    if (validate(picked.map((c) => c.id))) break;
  }

  let ids = picked.map((c) => c.id);
  for (const card of [...picked].sort((a, b) => byValue(b, a))) {
    const without = ids.filter((id) => id !== card.id);
    if (without.length > 0 && validate(without)) ids = without;
  }
  return ids;
}
