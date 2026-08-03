import type { PropertyColor } from './types.js';

/**
 * Canonical US-edition property sets: street names, bank value, and rent by
 * property count (index 0 = 1 card). `names.length` is the full-set size.
 */
export interface PropertySetDef {
  /** Bank / payment face value in millions. */
  value: number;
  /** Official property card titles (one card each). Length = set size. */
  names: readonly string[];
  /** Rent in millions for 1..N properties (N = names.length). */
  rent: readonly number[];
}

export const PROPERTY_SET_DEFS: Record<PropertyColor, PropertySetDef> = {
  brown: {
    value: 1,
    names: ['Mediterranean Avenue', 'Baltic Avenue'],
    rent: [1, 2],
  },
  light_blue: {
    value: 1,
    names: ['Oriental Avenue', 'Vermont Avenue', 'Connecticut Avenue'],
    rent: [1, 2, 3],
  },
  pink: {
    value: 2,
    names: ['St. Charles Place', 'States Avenue', 'Virginia Avenue'],
    rent: [1, 2, 4],
  },
  orange: {
    value: 2,
    names: ['St. James Place', 'Tennessee Avenue', 'New York Avenue'],
    rent: [1, 3, 5],
  },
  red: {
    value: 3,
    names: ['Kentucky Avenue', 'Indiana Avenue', 'Illinois Avenue'],
    rent: [2, 3, 6],
  },
  yellow: {
    value: 3,
    names: ['Atlantic Avenue', 'Ventnor Avenue', 'Marvin Gardens'],
    rent: [2, 4, 6],
  },
  green: {
    value: 4,
    names: ['Pacific Avenue', 'North Carolina Avenue', 'Pennsylvania Avenue'],
    rent: [2, 4, 7],
  },
  dark_blue: {
    value: 4,
    names: ['Park Place', 'Boardwalk'],
    rent: [3, 8],
  },
  railroad: {
    value: 2,
    names: [
      'Reading Railroad',
      'Pennsylvania Railroad',
      'B. & O. Railroad',
      'Short Line',
    ],
    rent: [1, 2, 3, 4],
  },
  utility: {
    value: 2,
    names: ['Electric Company', 'Water Works'],
    rent: [1, 2],
  },
};

/** Required cards to complete a set by color (from PROPERTY_SET_DEFS). */
export const SET_SIZES: Record<PropertyColor, number> = {
  brown: PROPERTY_SET_DEFS.brown.names.length,
  light_blue: PROPERTY_SET_DEFS.light_blue.names.length,
  pink: PROPERTY_SET_DEFS.pink.names.length,
  orange: PROPERTY_SET_DEFS.orange.names.length,
  red: PROPERTY_SET_DEFS.red.names.length,
  yellow: PROPERTY_SET_DEFS.yellow.names.length,
  green: PROPERTY_SET_DEFS.green.names.length,
  dark_blue: PROPERTY_SET_DEFS.dark_blue.names.length,
  railroad: PROPERTY_SET_DEFS.railroad.names.length,
  utility: PROPERTY_SET_DEFS.utility.names.length,
};

/** Rent by number of properties in the set (index = count - 1). */
export const RENT_TABLE: Record<PropertyColor, number[]> = {
  brown: [...PROPERTY_SET_DEFS.brown.rent],
  light_blue: [...PROPERTY_SET_DEFS.light_blue.rent],
  pink: [...PROPERTY_SET_DEFS.pink.rent],
  orange: [...PROPERTY_SET_DEFS.orange.rent],
  red: [...PROPERTY_SET_DEFS.red.rent],
  yellow: [...PROPERTY_SET_DEFS.yellow.rent],
  green: [...PROPERTY_SET_DEFS.green.rent],
  dark_blue: [...PROPERTY_SET_DEFS.dark_blue.rent],
  railroad: [...PROPERTY_SET_DEFS.railroad.rent],
  utility: [...PROPERTY_SET_DEFS.utility.rent],
};

/** Assert catalog integrity (rent rows match set size). */
export function assertPropertyCatalog(): void {
  for (const color of Object.keys(PROPERTY_SET_DEFS) as PropertyColor[]) {
    const def = PROPERTY_SET_DEFS[color];
    if (def.names.length !== def.rent.length) {
      throw new Error(
        `Property set ${color}: names (${def.names.length}) must match rent rows (${def.rent.length})`,
      );
    }
    if (SET_SIZES[color] !== def.names.length) {
      throw new Error(`SET_SIZES[${color}] out of sync with PROPERTY_SET_DEFS`);
    }
  }
}
