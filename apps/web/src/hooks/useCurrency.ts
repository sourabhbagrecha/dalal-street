import { useSyncExternalStore } from 'react';
import {
  CURRENCIES,
  getCurrencyCode,
  subscribeCurrency,
  setCurrencyCode,
  type CurrencyCode,
} from '../theme';

export function useCurrency() {
  const code = useSyncExternalStore(subscribeCurrency, getCurrencyCode, getCurrencyCode);
  const currency = CURRENCIES[code as CurrencyCode];
  return {
    code: code as CurrencyCode,
    currency,
    setCurrency: setCurrencyCode,
    formatMoney: currency.formatMoney,
  };
}
