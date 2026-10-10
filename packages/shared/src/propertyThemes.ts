import { PROPERTY_SET_DEFS } from './properties.js';
import type { PropertyThemeId } from './settings.js';
import type { PropertyCard, PropertyColor } from './types.js';

/**
 * Alternative names for the property cards. Presentation only: the deck is
 * always dealt from PROPERTY_SET_DEFS (the Indian edition), and a card's
 * `name` in game state stays its Indian city. A theme renames the card by its
 * slot in the set — `names[i]` here stands in for `PROPERTY_SET_DEFS[color].names[i]`
 * — so every list must keep the same length as the set it re-skins.
 */
export interface PropertyThemeSet {
  /** What the colour is called: a state, a country, or (classic) the colour group itself. */
  label: string;
  /** Card titles, slot for slot against PROPERTY_SET_DEFS[color].names. */
  names: readonly string[];
  /** Title on this colour's half of a property wildcard; never one of `names`. */
  wildName: string;
}

type PropertyTheme = Record<PropertyColor, PropertyThemeSet>;

const COLORS = Object.keys(PROPERTY_SET_DEFS) as PropertyColor[];

const INDIA: PropertyTheme = Object.fromEntries(
  COLORS.map((color) => {
    const def = PROPERTY_SET_DEFS[color];
    return [color, { label: def.state, names: def.names, wildName: def.wildName }];
  }),
) as PropertyTheme;

/** The original Atlantic City board. "Avenue" and "Railroad" are shortened so the title fits one line. */
const CLASSIC: PropertyTheme = {
  brown: { label: 'Brown', names: ['Mediterranean Ave', 'Baltic Ave'], wildName: 'Wild' },
  light_blue: { label: 'Light Blue', names: ['Oriental Ave', 'Vermont Ave', 'Connecticut Ave'], wildName: 'Wild' },
  pink: { label: 'Pink', names: ['St. Charles Place', 'States Ave', 'Virginia Ave'], wildName: 'Wild' },
  orange: { label: 'Orange', names: ['St. James Place', 'Tennessee Ave', 'New York Ave'], wildName: 'Wild' },
  red: { label: 'Red', names: ['Kentucky Ave', 'Indiana Ave', 'Illinois Ave'], wildName: 'Wild' },
  yellow: { label: 'Yellow', names: ['Atlantic Ave', 'Ventnor Ave', 'Marvin Gardens'], wildName: 'Wild' },
  green: { label: 'Green', names: ['Pacific Ave', 'North Carolina Ave', 'Pennsylvania Ave'], wildName: 'Wild' },
  dark_blue: { label: 'Dark Blue', names: ['Park Place', 'Boardwalk'], wildName: 'Wild' },
  railroad: {
    label: 'Railroads',
    names: ['Reading R.R.', 'Pennsylvania R.R.', 'B&O R.R.', 'Short Line'],
    wildName: 'Wild',
  },
  utility: { label: 'Utilities', names: ['Electric Company', 'Water Works'], wildName: 'Wild' },
};

/** Each colour is a US state, each card a place people actually travel to in it. */
const USA: PropertyTheme = {
  brown: { label: 'Tennessee', names: ['Nashville', 'Memphis'], wildName: 'Gatlinburg' },
  light_blue: { label: 'Colorado', names: ['Denver', 'Aspen', 'Vail'], wildName: 'Boulder' },
  pink: { label: 'Texas', names: ['Austin', 'Houston', 'San Antonio'], wildName: 'Dallas' },
  orange: { label: 'Nevada', names: ['Las Vegas', 'Reno', 'Lake Tahoe'], wildName: 'Henderson' },
  red: { label: 'Hawaii', names: ['Honolulu', 'Maui', 'Kauai'], wildName: 'Hilo' },
  yellow: { label: 'Florida', names: ['Miami', 'Orlando', 'Key West'], wildName: 'Tampa' },
  green: { label: 'California', names: ['Los Angeles', 'San Francisco', 'San Diego'], wildName: 'Napa' },
  dark_blue: { label: 'New York', names: ['New York City', 'Niagara Falls'], wildName: 'Hamptons' },
  railroad: { label: 'Arizona', names: ['Grand Canyon', 'Sedona', 'Phoenix', 'Tucson'], wildName: 'Scottsdale' },
  utility: { label: 'Massachusetts', names: ['Boston', 'Cape Cod'], wildName: 'Salem' },
};

/** Each colour is a European country, each card one of its best-known destinations. */
const EUROPE: PropertyTheme = {
  brown: { label: 'Austria', names: ['Vienna', 'Salzburg'], wildName: 'Innsbruck' },
  light_blue: { label: 'Portugal', names: ['Lisbon', 'Porto', 'Madeira'], wildName: 'Faro' },
  pink: { label: 'Greece', names: ['Athens', 'Santorini', 'Mykonos'], wildName: 'Crete' },
  orange: { label: 'Germany', names: ['Berlin', 'Munich', 'Hamburg'], wildName: 'Cologne' },
  red: { label: 'UK', names: ['London', 'Edinburgh', 'Oxford'], wildName: 'Bath' },
  yellow: { label: 'Spain', names: ['Barcelona', 'Madrid', 'Seville'], wildName: 'Valencia' },
  green: { label: 'Italy', names: ['Rome', 'Venice', 'Florence'], wildName: 'Milan' },
  dark_blue: { label: 'France', names: ['Paris', 'Nice'], wildName: 'Cannes' },
  railroad: { label: 'Switzerland', names: ['Zurich', 'Geneva', 'Lucerne', 'Interlaken'], wildName: 'Zermatt' },
  utility: { label: 'Netherlands', names: ['Amsterdam', 'Rotterdam'], wildName: 'Utrecht' },
};

export const PROPERTY_THEMES: Record<PropertyThemeId, PropertyTheme> = {
  india: INDIA,
  classic: CLASSIC,
  usa: USA,
  europe: EUROPE,
};

/**
 * The title a property card wears under a theme. A card whose name is not one
 * of its set's dealt names (a hand-built fixture card) keeps the name it has.
 */
export function themedPropertyName(themeId: PropertyThemeId, card: Pick<PropertyCard, 'color' | 'name'>): string {
  if (themeId === 'india') return card.name;
  const slot = PROPERTY_SET_DEFS[card.color].names.indexOf(card.name);
  return PROPERTY_THEMES[themeId][card.color].names[slot] ?? card.name;
}

/** Every theme must re-skin every slot: same set sizes as the dealt deck, and no wildcard named after a real card. */
export function assertPropertyThemes(): void {
  for (const themeId of Object.keys(PROPERTY_THEMES) as PropertyThemeId[]) {
    for (const color of COLORS) {
      const set = PROPERTY_THEMES[themeId][color];
      const size = PROPERTY_SET_DEFS[color].names.length;
      if (set.names.length !== size) {
        throw new Error(`Property theme ${themeId}/${color}: ${set.names.length} names for a set of ${size}`);
      }
      if (set.names.includes(set.wildName)) {
        throw new Error(`Property theme ${themeId}/${color}: wildName "${set.wildName}" must not be one of the set's cards`);
      }
    }
  }
}
