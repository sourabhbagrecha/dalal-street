import type { ActionType, PropertyColor } from '@monopoly-deal/shared';
import { INDIA_PROPERTY_THEME } from '../../indiaPropertyTheme';

/**
 * Every per-card colour the card faces use. Geometry (sizes, fonts, layout)
 * lives in the parts and cards.css; this file is only the palette each face
 * hands to those parts.
 */

/**
 * WCAG relative luminance / contrast ratio — used only to pick, per state,
 * whichever of two candidate ink colours actually reads against that state's
 * own background (see `bestInk`). Ten states span a huge luminance range
 * (from `#3A3733` railroad to `#E8A50A` yellow); no single fixed ink/cream
 * pairing clears 4.5:1 on all of them, and picking the wrong one silently
 * fails contrast (the bug this exists to catch — see card-aspect-ratio and
 * the FIX 3 audit in the legibility pass).
 */
function relLuminance(hex: string): number {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The two ink options every badge picks between: the game's cream (used
 *  everywhere text sits on a dark/mid panel) and true black — plain
 *  `INDIA_CARD_INK` (`#2B1608`) is dark but not dark enough to clear 4.5:1
 *  on the mid-luminance states (pink, green): only true black does. */
const BADGE_CREAM = '#FFFDF5';
const BADGE_BLACK = '#000000';

/** Picks whichever of the two badge inks contrasts better against `bg`. */
function bestInk(bg: string): string {
  return contrastRatio(BADGE_CREAM, bg) >= contrastRatio(BADGE_BLACK, bg) ? BADGE_CREAM : BADGE_BLACK;
}

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
  /** Outline colour for the value/CR text (`-webkit-text-stroke`), only set
   *  when a single flat fill can't clear contrast against every colour the
   *  bg actually shows (the four-band rainbow) — see ANY_BADGE. */
  textStroke?: string;
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
    // Cream-on-amber measures 3.13:1 (fails 4.5:1) — every other action
    // badge's bg is dark enough for cream to clear it; this one alone needs
    // the dark ink option instead (6.59:1).
    valueColor: '#000000',
    shadowColor: 'rgba(255,255,255,.35)',
    crColor: '#000000',
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

/** The four-band rainbow the "any" cards (Joker, wild rent) badge with. No
 *  flat fill clears 4.5:1 against all four bands at once (the gold band
 *  measures 1.79:1 against plain cream) — a black text-stroke gives every
 *  letter a contrasting ring regardless of which band it lands on, the same
 *  technique the RENT wordmark uses for its own per-state background. */
export const ANY_BADGE: BadgePalette = {
  bg: 'linear-gradient(180deg,#E8368F 0 25%,#F2B705 25% 50%,#0E9F5A 50% 75%,#16337E 75% 100%)',
  valueColor: '#FFFDF5',
  shadowColor: 'rgba(0,0,0,.5)',
  crColor: '#FFFFFF',
  barColor: '#FFFFFF',
  textStroke: '#000000',
};

export const JOKER_FACE_BG = '#17131C';

/** A property card's badge: that state's textured price-panel background,
 *  value/CR in whichever of cream/black actually reads against it (cream
 *  alone fails on five of the ten states — light_blue, pink, orange, yellow,
 *  green — down to 2.10:1 on yellow), and the state's light accent (its
 *  badge/glyph tint) for the bar. */
export function propertyBadge(color: PropertyColor): BadgePalette {
  const t = INDIA_PROPERTY_THEME[color];
  const ink = bestInk(t.base);
  return {
    bg: t.priceBg,
    valueColor: ink,
    shadowColor: ink === BADGE_CREAM ? t.priceValueShadow : 'rgba(255,255,255,.35)',
    crColor: ink,
    barColor: t.badgeColor,
  };
}

/** A two-colour wildcard's (or dual rent's) badge: one solid colour — the
 *  bottom, upside-down half's — with whichever of cream/black reads against
 *  it for value, CR and bar alike (the state's own dark `priceInk` used to
 *  carry CR/bar, but it's actually too light to clear 4.5:1 against three of
 *  the darkest bases — dark_blue, railroad, and brown — the same bug
 *  `bestInk` exists to catch on the value colour). */
export function wildBadge(color: PropertyColor): BadgePalette {
  const t = INDIA_PROPERTY_THEME[color];
  const ink = bestInk(t.base);
  return {
    bg: t.base,
    valueColor: ink,
    shadowColor: ink === BADGE_CREAM ? t.priceValueShadow : 'rgba(255,255,255,.35)',
    crColor: ink,
    barColor: ink,
  };
}
