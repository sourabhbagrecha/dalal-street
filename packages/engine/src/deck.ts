/**
 * Canonical Monopoly Deal 110-card deck (US edition composition).
 * Counts follow general_rules.md §6. The 4 Quick Start Rules are included
 * for conservation (out of play after setup). Conflicts with card.md are
 * recorded in DECISIONS.md.
 */
import type {
  ActionCard,
  Card,
  MoneyCard,
  PropertyCard,
  PropertyColor,
  PropertyWildCard,
  RentCard,
  RuleCard,
} from '@monopoly-deal/shared';

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}

/** Reset id sequence — used by tests that rebuild decks in isolation. */
export function resetDeckIdSequence(): void {
  seq = 0;
}

function money(amount: number): MoneyCard {
  return { id: nextId(`money_${amount}m`), kind: 'money', amount, value: amount };
}

function property(color: PropertyColor, value: number): PropertyCard {
  return { id: nextId(`prop_${color}`), kind: 'property', color, value };
}

function wild(colors: PropertyColor[], value: number): PropertyWildCard {
  const tag = colors.length === 0 ? 'multi' : colors.join('_');
  return { id: nextId(`wild_${tag}`), kind: 'property_wild', colors, value };
}

function action(
  action: ActionCard['action'],
  value: number,
): ActionCard {
  return { id: nextId(`action_${action}`), kind: 'action', action, value };
}

function rentDual(colors: [PropertyColor, PropertyColor], value: number): RentCard {
  return {
    id: nextId(`rent_${colors[0]}_${colors[1]}`),
    kind: 'rent',
    rentType: 'dual',
    colors,
    value,
  };
}

function rentWild(): RentCard {
  return {
    id: nextId('rent_wild'),
    kind: 'rent',
    rentType: 'wild',
    colors: [],
    value: 3,
  };
}

function rule(): RuleCard {
  return { id: nextId('rule'), kind: 'rule', value: 0 };
}

/**
 * Build the full official 110-card deck (unshuffled).
 * Composition from general_rules.md §6.
 */
export function buildDeck(): Card[] {
  resetDeckIdSequence();
  const cards: Card[] = [];

  // 4 Quick Start Rules
  for (let i = 0; i < 4; i++) cards.push(rule());

  // 20 Money Cards
  for (let i = 0; i < 6; i++) cards.push(money(1));
  for (let i = 0; i < 5; i++) cards.push(money(2));
  for (let i = 0; i < 3; i++) cards.push(money(3));
  for (let i = 0; i < 3; i++) cards.push(money(4));
  for (let i = 0; i < 2; i++) cards.push(money(5));
  cards.push(money(10));

  // 34 Action Cards (general_rules.md counts)
  for (let i = 0; i < 2; i++) cards.push(action('deal_breaker', 5));
  for (let i = 0; i < 3; i++) cards.push(action('just_say_no', 4));
  for (let i = 0; i < 10; i++) cards.push(action('pass_go', 1));
  for (let i = 0; i < 3; i++) cards.push(action('forced_deal', 3));
  for (let i = 0; i < 3; i++) cards.push(action('sly_deal', 3));
  for (let i = 0; i < 3; i++) cards.push(action('debt_collector', 3));
  for (let i = 0; i < 3; i++) cards.push(action('its_my_birthday', 2));
  for (let i = 0; i < 2; i++) cards.push(action('double_the_rent', 1));
  for (let i = 0; i < 3; i++) cards.push(action('house', 3));
  for (let i = 0; i < 2; i++) cards.push(action('hotel', 4));

  // 13 Rent Cards
  for (let i = 0; i < 2; i++) cards.push(rentDual(['dark_blue', 'green'], 1));
  for (let i = 0; i < 2; i++) cards.push(rentDual(['red', 'yellow'], 1));
  for (let i = 0; i < 2; i++) cards.push(rentDual(['pink', 'orange'], 1));
  for (let i = 0; i < 2; i++) cards.push(rentDual(['light_blue', 'brown'], 1));
  for (let i = 0; i < 2; i++) cards.push(rentDual(['railroad', 'utility'], 1));
  for (let i = 0; i < 3; i++) cards.push(rentWild());

  // 28 Property Cards
  for (let i = 0; i < 2; i++) cards.push(property('dark_blue', 4));
  for (let i = 0; i < 2; i++) cards.push(property('brown', 1));
  for (let i = 0; i < 2; i++) cards.push(property('utility', 2));
  for (let i = 0; i < 3; i++) cards.push(property('green', 4));
  for (let i = 0; i < 3; i++) cards.push(property('yellow', 3));
  for (let i = 0; i < 3; i++) cards.push(property('red', 3));
  for (let i = 0; i < 3; i++) cards.push(property('orange', 2));
  for (let i = 0; i < 3; i++) cards.push(property('pink', 2));
  for (let i = 0; i < 3; i++) cards.push(property('light_blue', 1));
  for (let i = 0; i < 4; i++) cards.push(property('railroad', 2));

  // 11 Property Wildcards
  cards.push(wild(['dark_blue', 'green'], 4));
  cards.push(wild(['green', 'railroad'], 4));
  cards.push(wild(['utility', 'railroad'], 2));
  cards.push(wild(['light_blue', 'railroad'], 1));
  cards.push(wild(['light_blue', 'brown'], 1));
  cards.push(wild(['pink', 'orange'], 2));
  cards.push(wild(['pink', 'orange'], 2));
  cards.push(wild(['red', 'yellow'], 3));
  cards.push(wild(['red', 'yellow'], 3));
  cards.push(wild([], 0)); // multicolor
  cards.push(wild([], 0)); // multicolor

  if (cards.length !== 110) {
    throw new Error(`Deck must have 110 cards, got ${cards.length}`);
  }
  return cards;
}

export function deckCompositionSummary(cards: Card[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const c of cards) {
    let key: string;
    if (c.kind === 'money') key = `money_${c.amount}`;
    else if (c.kind === 'property') key = `property_${c.color}`;
    else if (c.kind === 'property_wild')
      key = c.colors.length === 0 ? 'wild_multi' : `wild_${c.colors.join('_')}`;
    else if (c.kind === 'action') key = `action_${c.action}`;
    else if (c.kind === 'rent')
      key = c.rentType === 'wild' ? 'rent_wild' : `rent_${c.colors.join('_')}`;
    else key = 'rule';
    summary[key] = (summary[key] ?? 0) + 1;
  }
  return summary;
}
