import type { ActionType, PropertyColor } from '@monopoly-deal/shared';
import { INDIA_PROPERTY_THEME } from '../../indiaPropertyTheme';

/**
 * Every per-card colour the card faces use. Geometry (sizes, fonts, layout)
 * lives in the parts and cards.css; this file is only the palette each face
 * hands to those parts.
 */

/** Colours a PriceBadge paints itself with — the one per-card input it takes. */
export interface BadgePalette {
  /** CSS `background` (solid colour or gradient). */
  bg: string;
  /** Diagonal hazard-stripe overlay opacity; omit for a flat badge. */
  stripeOpacity?: number;
  valueColor: string;
  shadowColor: string;
  /** Value text-shadow Y offset in reference px — 8 normally, 7 on the two
   *  gold-gradient badges (money, double-the-rent). */
  shadowOffsetY?: number;
  crColor: string;
  barColor: string;
}

const STEAL_BADGE: BadgePalette = {
  bg: '#E11D2E',
  stripeOpacity: 0.16,
  valueColor: '#FFFDF5',
  shadowColor: '#7E0716',
  crColor: '#FFFFFF',
  barColor: '#33030A',
};

const GOLD_BADGE: BadgePalette = {
  bg: 'linear-gradient(170deg,#FFE58A,#FFCE3F 45%,#E3A81F)',
  valueColor: '#2B1608',
  shadowColor: 'rgba(255,255,255,.4)',
  shadowOffsetY: 7,
  crColor: '#000000',
  barColor: '#4A3300',
};

/** Rent cards' badge — the same gold chip the money and double-the-rent
 *  cards wear, which is what the invoice face is built around. */
export const RENT_BADGE: BadgePalette = GOLD_BADGE;

export const ACTION_BADGE: Record<ActionType, BadgePalette> = {
  pass_go: { bg: '#05512A', valueColor: '#FFFDF5', shadowColor: '#022914', crColor: '#FFFFFF', barColor: '#7BE3A0' },
  sly_deal: STEAL_BADGE,
  forced_deal: STEAL_BADGE,
  debt_collector: STEAL_BADGE,
  its_my_birthday: STEAL_BADGE,
  deal_breaker: { bg: '#33030A', valueColor: '#FFFFFF', shadowColor: '#000000', crColor: '#FFFFFF', barColor: '#FFF3DC' },
  double_the_rent: GOLD_BADGE,
  house: {
    bg: '#D97706',
    stripeOpacity: 0.14,
    valueColor: '#FFFDF5',
    shadowColor: '#7A3B00',
    crColor: '#FFFFFF',
    barColor: '#3A1D00',
  },
  hotel: {
    bg: '#B0004E',
    stripeOpacity: 0.14,
    valueColor: '#FFFDF5',
    shadowColor: '#6B0038',
    crColor: '#FFFFFF',
    barColor: '#3A0020',
  },
  just_say_no: {
    bg: '#1D4ED8',
    stripeOpacity: 0.14,
    valueColor: '#FFFDF5',
    shadowColor: '#0A1B45',
    crColor: '#FFFFFF',
    barColor: '#FFCE3F',
  },
};

/** The card's own base colour per action — the one genuinely per-card inline
 *  value, set on `.playing-card__af` itself. */
export const ACTION_BG: Record<ActionType, string> = {
  pass_go: '#0E8F4D',
  sly_deal: '#17090C',
  forced_deal: '#17090C',
  debt_collector: '#17090C',
  its_my_birthday: '#6D28D9',
  deal_breaker: '#7E0716',
  double_the_rent: '#1A1114',
  house: '#FFF3DC',
  hotel: '#FFF3DC',
  just_say_no: '#143A8F',
};

export const MONEY_BADGE: BadgePalette = {
  ...GOLD_BADGE,
  valueColor: '#2A0A4A',
  shadowColor: 'rgba(255,255,255,.45)',
};

/** Every money denomination's face — same gold sunburst/frame/corner-badge
 *  treatment, differing only by base colour, printed value, and the
 *  "N in the deck" scarcity pill. */
export const MONEY_FACE_BG: Record<number, string> = {
  1: '#0B3D2E',
  2: '#4A0E1F',
  3: '#1F2937',
  4: '#0B2A4A',
  5: '#3B1673',
  10: '#2A0A4A',
};

export const MONEY_WORDS: Record<number, string> = {
  1: 'ONE',
  2: 'TWO',
  3: 'THREE',
  4: 'FOUR',
  5: 'FIVE',
  10: 'TEN',
};

/** Cards printed per denomination in the 110-card deck (general_rules.md §6,
 *  mirrored from packages/engine/src/deck.ts) — display flavour for the
 *  pill only, not authoritative. */
export const MONEY_DECK_COUNTS: Record<number, number> = {
  1: 6,
  2: 5,
  3: 3,
  4: 3,
  5: 2,
  10: 1,
};

/** The four-band rainbow the "any" cards (Joker, wild rent) badge with. */
export const ANY_BADGE: BadgePalette = {
  bg: 'linear-gradient(180deg,#E8368F 0 25%,#F2B705 25% 50%,#0E9F5A 50% 75%,#16337E 75% 100%)',
  valueColor: '#FFFDF5',
  shadowColor: 'rgba(0,0,0,.5)',
  crColor: '#FFFFFF',
  barColor: '#FFFFFF',
};

export const JOKER_FACE_BG = '#17131C';

/** A property card's badge: that state's textured price-panel background,
 *  cream value, CR, and bar all in the one cream — the state only tints the
 *  background and the shadow. */
export function propertyBadge(color: PropertyColor): BadgePalette {
  const t = INDIA_PROPERTY_THEME[color];
  return {
    bg: t.priceBg,
    valueColor: '#FFFDF5',
    shadowColor: t.priceValueShadow,
    crColor: '#FFFDF5',
    barColor: '#FFFDF5',
  };
}

/** A two-colour wildcard's (or dual rent's) badge: one solid colour — the
 *  bottom, upside-down half's — with cream value, CR, and bar all matching. */
export function wildBadge(color: PropertyColor): BadgePalette {
  const t = INDIA_PROPERTY_THEME[color];
  return {
    bg: t.base,
    valueColor: '#FFFDF5',
    shadowColor: t.priceValueShadow,
    crColor: '#FFFDF5',
    barColor: '#FFFDF5',
  };
}
