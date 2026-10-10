import type { CurrencyCode, PropertyCard, PropertyColor, PropertyThemeId, RoomSettings } from '@monopoly-deal/shared';
import { DEFAULT_ROOM_SETTINGS, PROPERTY_THEMES, roomSettingsSchema, themedPropertyName } from '@monopoly-deal/shared';
import { INDIA_PROPERTY_THEME } from './indiaPropertyTheme';

interface CurrencyConfig {
  symbol: string;
  suffix: string;
  /** The suffix spelled out, for the money card's caption ("TEN CRORE"). */
  unit: string;
  formatMoney(amount: number): string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  INR: {
    symbol: '₹',
    suffix: 'Cr',
    unit: 'Crore',
    formatMoney(amount: number) {
      return `₹${amount}Cr`;
    },
  },
  USD: {
    symbol: '$',
    suffix: 'M',
    unit: 'Million',
    formatMoney(amount: number) {
      return `$${amount}M`;
    },
  },
  EUR: {
    symbol: '€',
    suffix: 'M',
    unit: 'Million',
    formatMoney(amount: number) {
      return `€${amount}M`;
    },
  },
  // The Classic deck's struck-through M. Unicode has no such sign: U+E000 is drawn by styles/money-glyph.css.
  MONO: {
    symbol: '',
    suffix: 'M',
    unit: 'Million',
    formatMoney(amount: number) {
      return `${amount}M`;
    },
  },
};

/**
 * Which settings the cards on screen are drawn with (titles, currency) and
 * which a new table starts from. Two sources:
 *
 * - the room the viewer is in — its host's choice, the same for every seat;
 * - otherwise the viewer's own saved pick from the home screen's advanced
 *   settings, which is also what the next table they create is sent with.
 *
 * The room always wins while there is one (see `setRoomSettings`, fed from the
 * store in store/useStore.ts).
 */
const STORAGE_KEY = 'monopoly-deal:settings';
/** Where the old in-game currency toggle kept its choice; still honoured as the saved currency. */
const LEGACY_CURRENCY_KEY = 'monopoly-deal:currency';

function readSaved(): RoomSettings {
  if (typeof window === 'undefined') return DEFAULT_ROOM_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = roomSettingsSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    }
    const legacy = window.localStorage.getItem(LEGACY_CURRENCY_KEY);
    if (legacy === 'USD') return { ...DEFAULT_ROOM_SETTINGS, currency: 'USD' };
  } catch {
    // ignore
  }
  return DEFAULT_ROOM_SETTINGS;
}

const sameSettings = (a: RoomSettings, b: RoomSettings): boolean =>
  a.turnSeconds === b.turnSeconds && a.propertyTheme === b.propertyTheme && a.currency === b.currency;

let saved: RoomSettings = readSaved();
let room: RoomSettings | null = null;

const listeners = new Set<() => void>();
const notify = () => {
  for (const fn of listeners) fn();
};

/** The settings in force for what is on screen: the room's, or the viewer's saved pick outside one. */
export function getDisplaySettings(): RoomSettings {
  return room ?? saved;
}

/** The viewer's own pick, sent with the next table they create. */
export function getSavedSettings(): RoomSettings {
  return saved;
}

export function setSavedSettings(next: RoomSettings): void {
  if (sameSettings(next, saved)) return;
  saved = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  notify();
}

/** The room the viewer sits in (or watches) dictates the display; null once they are in none. */
export function setRoomSettings(next: RoomSettings | null): void {
  if (next === room || (next && room && sameSettings(next, room))) return;
  room = next;
  notify();
}

export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getCurrency(): CurrencyConfig {
  return CURRENCIES[getDisplaySettings().currency];
}

/** What a colour group and its cards are, in each theme's own words ("which state?", "ANY COUNTRY"). */
interface SetWords {
  one: string;
  many: string;
  card: string;
}

const SET_WORDS: Record<PropertyThemeId, SetWords> = {
  india: { one: 'state', many: 'states', card: 'city' },
  classic: { one: 'colour', many: 'colours', card: 'property' },
  usa: { one: 'state', many: 'states', card: 'city' },
  europe: { one: 'country', many: 'countries', card: 'city' },
};

const labelsByTheme = new Map<PropertyThemeId, Record<PropertyColor, string>>();

function setLabels(): Record<PropertyColor, string> {
  const themeId = getDisplaySettings().propertyTheme;
  let labels = labelsByTheme.get(themeId);
  if (!labels) {
    const sets = PROPERTY_THEMES[themeId];
    labels = Object.fromEntries(
      (Object.keys(sets) as PropertyColor[]).map((color) => [color, sets[color].label]),
    ) as Record<PropertyColor, string>;
    labelsByTheme.set(themeId, labels);
  }
  return labels;
}

/**
 * The shades a property colour needs on the card face. Everything but `base` is
 * precomputed from it with the design's own mixing formula (base→black 0.15,
 * base→white 0.86 / 0.78 / 0.65) rather than derived at runtime, so a single
 * shade can be nudged without moving the whole ramp.
 */
interface PropertyTints {
  /** Border, badge fill, city title, mini-card icons. */
  base: string;
  /** Rent amounts and the FULL SET pill text — base is too light for small text. */
  dark: string;
  /** FULL SET pill background. */
  light: string;
  /** Wildcard half fill — needs more colour than `light` to read against cream. */
  field: string;
  /** Dashed rent-row separators. */
  line: string;
}

const PROPERTY_PALETTE: Record<PropertyColor, PropertyTints> = {
  brown: { base: '#a8672e', dark: '#8f5827', light: '#f3eae2', field: '#ecded1', line: '#e1cab6' },
  light_blue: { base: '#0d84c4', dark: '#0b70a7', light: '#ddeef7', field: '#cae4f2', line: '#aad4ea' },
  pink: { base: '#b81a5c', dark: '#9c164e', light: '#f5dfe8', field: '#efcddb', line: '#e6afc6' },
  orange: { base: '#d35400', dark: '#b34700', light: '#f9e7db', field: '#f5d9c7', line: '#f0c3a6' },
  red: { base: '#c62828', dark: '#a82222', light: '#f7e1e1', field: '#f2d0d0', line: '#ebb4b4' },
  yellow: { base: '#c79a0b', dark: '#a98309', light: '#f7f1dd', field: '#f3e9c9', line: '#ebdcaa' },
  green: { base: '#178c4e', dark: '#147742', light: '#dfefe6', field: '#cce6d8', line: '#aed7c1' },
  dark_blue: { base: '#2c4a75', dark: '#253f63', light: '#e1e6ec', field: '#d1d7e1', line: '#b5c0cf' },
  railroad: { base: '#5c5c5c', dark: '#4e4e4e', light: '#e8e8e8', field: '#dbdbdb', line: '#c6c6c6' },
  utility: { base: '#3b1673', dark: '#321362', light: '#e4deeb', field: '#d4cce0', line: '#baadce' },
};

/** Colour order for the multicolour wildcard's rainbow, walking the map roughly
    north to south so the band reads as a journey rather than a random spread. */
const RAINBOW_ORDER: PropertyColor[] = [
  'pink',
  'utility',
  'orange',
  'railroad',
  'brown',
  'dark_blue',
  'green',
  'light_blue',
  'yellow',
  'red',
];

export const theme = {
  get currencySymbol(): string {
    return getCurrency().symbol;
  },
  get currencySuffix(): string {
    return getCurrency().suffix;
  },
  get currencyUnit(): string {
    return getCurrency().unit;
  },
  formatMoney(amount: number): string {
    return getCurrency().formatMoney(amount);
  },
  /** Set labels: what each colour is called under the property theme in force (a state, a country, a colour group). */
  get propertyNames(): Record<string, string> {
    return setLabels();
  },
  get setWords(): SetWords {
    return SET_WORDS[getDisplaySettings().propertyTheme];
  },
  /** A property card's title under the property theme in force. */
  propertyTitle(card: Pick<PropertyCard, 'color' | 'name'>): string {
    return themedPropertyName(getDisplaySettings().propertyTheme, card);
  },
  /** The title on one colour's half of a property wildcard. */
  wildTitle(color: PropertyColor): string {
    return PROPERTY_THEMES[getDisplaySettings().propertyTheme][color].wildName;
  },
  moneyColors: {
    1: '#B9E4C9',
    2: '#F7C6C7',
    3: '#D9D9D9',
    4: '#B8D8F0',
    5: '#C9B8E8',
    10: '#F2C14E',
  } as Record<number, string>,
  propertyColors: Object.fromEntries(
    Object.keys(PROPERTY_PALETTE).map((color) => [color, INDIA_PROPERTY_THEME[color as PropertyColor].base]),
  ) as Record<string, string>,
  /** Every set colour at once, for the multicolour wildcard that joins any of them. */
  rainbow(stops: 'base' | 'field'): string {
    const step = 100 / RAINBOW_ORDER.length;
    const bands = RAINBOW_ORDER.map((color, i) => {
      const c = stops === 'base' ? INDIA_PROPERTY_THEME[color].base : PROPERTY_PALETTE[color].field;
      return `${c} ${i * step}%, ${c} ${(i + 1) * step}%`;
    });
    return `linear-gradient(135deg, ${bands.join(', ')})`;
  },
  actionNames: {
    pass_go: 'Pass Go',
    deal_breaker: 'Deal Breaker',
    sly_deal: 'Sly Deal',
    forced_deal: 'Forced Deal',
    debt_collector: 'Debt Collector',
    its_my_birthday: "It's My Birthday",
    just_say_no: 'Just Say No',
    double_the_rent: 'Double the Rent',
    house: 'House',
    hotel: 'Hotel',
  } as Record<string, string>,
  playerNames: ['Aarav', 'Priya', 'Marcus', 'Yuki', 'Alex'] as string[],
  /** Identity colour per opponent, indexed by that seat's position among the
   *  viewer's opponents (`opponentsOfClient` order). Same four the opponent
   *  rail's nth-child rules paint, in the same order, so a seat keeps its
   *  colour whether it's a rail card or a rim seat. */
  opponentColors: ['#1f72c4', '#f2d22e', '#1fa85a', '#c4552f'] as string[],
  opponentColor(index: number): string {
    return this.opponentColors[index % this.opponentColors.length]!;
  },
  /** Readable text colour for each entry in `opponentColors`, by contrast
   *  ratio (WCAG) — the palette mixes light (yellow, green) and dark (blue,
   *  orange) fills, so a single fixed text colour fails on half of them. */
  opponentTextColors: ['#fff6e2', '#14110e', '#14110e', '#fff6e2'] as string[],
  opponentTextColor(index: number): string {
    return this.opponentTextColors[index % this.opponentTextColors.length]!;
  },
  /** The viewer's own seat on the table rim — distinct from every opponent colour. */
  selfColor: '#3b1673',
  selfTextColor: '#fff6e2',
  seatName(index: number, isLocal: boolean): string {
    if (isLocal) return 'You';
    return this.playerNames[index] ?? `Player ${index + 1}`;
  },
};
