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
  propertyNames: {
    brown: 'Brown',
    light_blue: 'Light Blue',
    pink: 'Purple',
    orange: 'Orange',
    red: 'Red',
    yellow: 'Yellow',
    green: 'Green',
    dark_blue: 'Dark Blue',
    railroad: 'Railroad',
    utility: 'Utility',
  } as Record<string, string>,
  moneyColors: {
    1: '#B9E4C9',
    2: '#F7C6C7',
    3: '#D9D9D9',
    4: '#B8D8F0',
    5: '#C9B8E8',
    10: '#F2C14E',
  } as Record<number, string>,
  propertyColors: {
    brown: '#8B5E3C',
    light_blue: '#AEDCF0',
    pink: '#D93C96',
    orange: '#F0A23C',
    red: '#E03B2F',
    yellow: '#F2D22E',
    green: '#1FA85A',
    dark_blue: '#1F72C4',
    railroad: '#2E2A26',
    utility: '#A8B0A0',
  } as Record<string, string>,
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
  playerNames: ['You', 'Priya', 'Marcus', 'Yuki', 'Alex'] as string[],
  seatName(index: number, isLocal: boolean): string {
    if (isLocal) return 'You';
    return this.playerNames[index] ?? `Player ${index + 1}`;
  },
};
