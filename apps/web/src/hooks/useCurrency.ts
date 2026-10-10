import { useSyncExternalStore } from 'react';
import { CURRENCIES, getDisplaySettings, subscribeSettings } from '../theme';

/**
 * The settings the screen is drawn with — the room's, or the viewer's saved pick outside one (see theme.ts).
 * Subscribing re-renders the caller when they change, which is what keeps `theme.*` reads below it fresh.
 */
export function useDisplaySettings() {
  return useSyncExternalStore(subscribeSettings, getDisplaySettings, getDisplaySettings);
}

export function useCurrency() {
  const { currency: code } = useDisplaySettings();
  const currency = CURRENCIES[code];
  return {
    code,
    currency,
    formatMoney: currency.formatMoney,
  };
}
