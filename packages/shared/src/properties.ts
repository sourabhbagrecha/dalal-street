import type { PropertyColor } from './types.js';

/**
 * Property sets, Indian edition: each colour is a state and each card in it is
 * a city of that state. Bank value and rent by property count (index 0 = 1
 * card) are unchanged from the canonical US edition, so set sizes are fixed —
 * `names.length` is the full-set size and must keep matching `rent.length`.
 */
export interface PropertySetDef {
  /** Bank / payment face value in millions. */
  value: number;
  /** The state this colour represents; used as the set's display label. */
  state: string;
  /** City card titles (one card each). Length = set size. */
  names: readonly string[];
  /**
   * A further city of the same state, shown on property wildcards. Deliberately
   * not one of `names`: a wildcard stands in for any slot in the set, so naming
   * it after a real card would imply it only substitutes for that one.
   */
  wildName: string;
  /** Rent in millions for 1..N properties (N = names.length). */
  rent: readonly number[];
}

export const PROPERTY_SET_DEFS: Record<PropertyColor, PropertySetDef> = {
  brown: {
    value: 1,
    state: 'Gujarat',
    names: ['Ahmedabad', 'Surat'],
    wildName: 'Vadodara',
    rent: [1, 2],
  },
  light_blue: {
    value: 1,
    state: 'Kerala',
    names: ['Kochi', 'Munnar', 'Alappuzha'],
    wildName: 'Kozhikode',
    rent: [1, 2, 3],
  },
  pink: {
    value: 2,
    state: 'Rajasthan',
    names: ['Udaipur', 'Jaipur', 'Jodhpur'],
    wildName: 'Jaisalmer',
    rent: [1, 2, 4],
  },
  orange: {
    value: 2,
    state: 'Assam',
    names: ['Guwahati', 'Dibrugarh', 'Silchar'],
    wildName: 'Jorhat',
    rent: [1, 3, 5],
  },
  red: {
    value: 3,
    state: 'Odisha',
    names: ['Bhubaneswar', 'Puri', 'Cuttack'],
    wildName: 'Konark',
    rent: [2, 3, 6],
  },
  yellow: {
    value: 3,
    state: 'Tamil Nadu',
    names: ['Chennai', 'Madurai', 'Thanjavur'],
    wildName: 'Coimbatore',
    rent: [2, 4, 6],
  },
  green: {
    value: 4,
    state: 'Goa',
    names: ['Panaji', 'Margao', 'Vasco'],
    wildName: 'Mapusa',
    rent: [2, 4, 7],
  },
  dark_blue: {
    value: 4,
    state: 'Maharashtra',
    names: ['Mumbai', 'Pune'],
    wildName: 'Nashik',
    rent: [3, 8],
  },
  railroad: {
    value: 2,
    state: 'Karnataka',
    names: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi'],
    wildName: 'Hampi',
    rent: [1, 2, 3, 4],
  },
  utility: {
    value: 2,
    state: 'Uttar Pradesh',
    names: ['Agra', 'Varanasi'],
    wildName: 'Lucknow',
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

/** Display label for each colour: the state its cities belong to. */
export const STATE_NAMES: Record<PropertyColor, string> = {
  brown: PROPERTY_SET_DEFS.brown.state,
  light_blue: PROPERTY_SET_DEFS.light_blue.state,
  pink: PROPERTY_SET_DEFS.pink.state,
  orange: PROPERTY_SET_DEFS.orange.state,
  red: PROPERTY_SET_DEFS.red.state,
  yellow: PROPERTY_SET_DEFS.yellow.state,
  green: PROPERTY_SET_DEFS.green.state,
  dark_blue: PROPERTY_SET_DEFS.dark_blue.state,
  railroad: PROPERTY_SET_DEFS.railroad.state,
  utility: PROPERTY_SET_DEFS.utility.state,
};

/** City shown for each colour on property wildcards (never a real card title). */
export const WILD_CITY_NAMES: Record<PropertyColor, string> = {
  brown: PROPERTY_SET_DEFS.brown.wildName,
  light_blue: PROPERTY_SET_DEFS.light_blue.wildName,
  pink: PROPERTY_SET_DEFS.pink.wildName,
  orange: PROPERTY_SET_DEFS.orange.wildName,
  red: PROPERTY_SET_DEFS.red.wildName,
  yellow: PROPERTY_SET_DEFS.yellow.wildName,
  green: PROPERTY_SET_DEFS.green.wildName,
  dark_blue: PROPERTY_SET_DEFS.dark_blue.wildName,
  railroad: PROPERTY_SET_DEFS.railroad.wildName,
  utility: PROPERTY_SET_DEFS.utility.wildName,
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
    if (def.names.includes(def.wildName)) {
      throw new Error(
        `Property set ${color}: wildName "${def.wildName}" must not be one of the set's cards`,
      );
    }
  }
}
