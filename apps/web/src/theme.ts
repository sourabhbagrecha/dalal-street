import type { PropertyColor } from '@monopoly-deal/shared';
import { STATE_NAMES } from '@monopoly-deal/shared';

/** Configurable theme — currency defaults to Indian (₹Cr), toggle to US ($M). */
export type CurrencyCode = 'INR' | 'USD';

export interface CurrencyConfig {
  symbol: string;
  suffix: string;
  formatMoney(amount: number): string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  INR: {
    symbol: '₹',
    suffix: 'Cr',
    formatMoney(amount: number) {
      return `₹${amount}Cr`;
    },
  },
  USD: {
    symbol: '$',
    suffix: 'M',
    formatMoney(amount: number) {
      return `$${amount}M`;
    },
  },
};

const STORAGE_KEY = 'monopoly-deal:currency';

function readStored(): CurrencyCode | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'INR' || v === 'USD') return v;
  } catch {
    // ignore
  }
  return null;
}

let current: CurrencyCode = readStored() ?? 'INR';

const listeners = new Set<() => void>();

export function getCurrencyCode(): CurrencyCode {
  return current;
}

export function getCurrency(): CurrencyConfig {
  return CURRENCIES[current];
}

export function setCurrencyCode(code: CurrencyCode): void {
  if (code === current) return;
  current = code;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // ignore
    }
  }
  for (const fn of listeners) fn();
}

export function subscribeCurrency(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The shades a property colour needs on the card face. Everything but `base` is
 * precomputed from it with the design's own mixing formula (base→black 0.15,
 * base→white 0.86 / 0.78 / 0.65) rather than derived at runtime, so a single
 * shade can be nudged without moving the whole ramp.
 */
export interface PropertyTints {
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
  formatMoney(amount: number): string {
    return getCurrency().formatMoney(amount);
  },
  /** Set labels: the state each colour represents, mirroring the card titles. */
  propertyNames: { ...STATE_NAMES } as Record<string, string>,
  moneyColors: {
    1: '#B9E4C9',
    2: '#F7C6C7',
    3: '#D9D9D9',
    4: '#B8D8F0',
    5: '#C9B8E8',
    10: '#F2C14E',
  } as Record<number, string>,
  propertyColors: Object.fromEntries(
    Object.entries(PROPERTY_PALETTE).map(([color, tints]) => [color, tints.base]),
  ) as Record<string, string>,
  /** Every set colour at once, for the multicolour wildcard that joins any of them. */
  rainbow(stops: 'base' | 'field'): string {
    const step = 100 / RAINBOW_ORDER.length;
    const bands = RAINBOW_ORDER.map((color, i) => {
      const c = PROPERTY_PALETTE[color][stops];
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
  /**
   * Seat 0's real name. "You" is never a seat's identity — it is produced
   * only by the viewer-relative rendering path below, when a name resolves
   * to the current viewer's own seat. Rendering seat 0 as "You" for every
   * viewer made third-person log lines nonsensical (e.g. "You owes ... to
   * You") and broke the pass-and-play hand-off screen ("Pass the phone to
   * You").
   */
  playerNames: ['Aarav', 'Priya', 'Marcus', 'Yuki', 'Alex'] as string[],
  seatName(index: number, isLocal: boolean): string {
    if (isLocal) return 'You';
    return this.playerNames[index] ?? `Player ${index + 1}`;
  },
};
