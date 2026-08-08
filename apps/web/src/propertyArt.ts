import type { PropertyColor } from '@monopoly-deal/shared';

import brown from './assets/properties/brown.svg';
import darkBlue from './assets/properties/dark_blue.svg';
import green from './assets/properties/green.svg';
import lightBlue from './assets/properties/light_blue.svg';
import orange from './assets/properties/orange.svg';
import pink from './assets/properties/pink.svg';
import railroad from './assets/properties/railroad.svg';
import red from './assets/properties/red.svg';
import utility from './assets/properties/utility.svg';
import yellow from './assets/properties/yellow.svg';

/**
 * Landmark silhouette shown behind each property card, one per state (so every
 * city in a set shares its state's landmark). Imported rather than referenced
 * by URL so a missing or misnamed file fails the build instead of the card.
 */
export const PROPERTY_ART: Record<PropertyColor, string> = {
  brown, // Gujarat — Statue of Unity
  light_blue: lightBlue, // Kerala — Kathakali
  pink, // Rajasthan — Hawa Mahal
  orange, // Assam — Buddha
  red, // Odisha — Konark chariot
  yellow, // Tamil Nadu — gopuram
  green, // Goa — coconut palms
  dark_blue: darkBlue, // Maharashtra — Gateway of India
  railroad, // Karnataka — Gol Gumbaz
  utility, // Uttar Pradesh — Taj Mahal
};
