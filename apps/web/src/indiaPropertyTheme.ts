import type { PropertyColor } from '@monopoly-deal/shared';

/**
 * Per-state colour/pattern tokens for the property card face, reverse-engineered
 * pixel-for-pixel from the approved design (`Property Cards.dc.html`, 750×1050
 * reference artboard — a 5:7 ratio, matching `.playing-card`'s own aspect-ratio,
 * which is why every offset below converts to a CSS % or cqw value with a single
 * factor instead of two). Values are literal, not derived from a shared ramp: the
 * design uses two or three near-identical dark browns per state and they are kept
 * distinct here rather than collapsed to a formula.
 */
export interface IndiaPropertyTheme {
  /** Band / price-panel / mini-card / row-icon accent. */
  base: string;
  /** Textured band background (lighter overlay — embossed). */
  bandBg: string;
  /** Textured price-panel background (darker overlay — inset). */
  priceBg: string;
  /** Badge pill fill and the landmark glyph's fill (small + large). */
  badgeBg: string;
  badgeColor: string;
  /** Tagline text under the badge. */
  taglineColor: string;
  /** CR label / divider / house-icon roof+body / PROPERTY label. */
  priceInk: string;
  /** City title colour. */
  cityColor: string;
  /** ₹ value's drop-shadow colour (corner price panel). */
  priceValueShadow: string;
  /** City title's drop-shadow colour, also the dashed rule under it. */
  cityShadow: string;
  /** Rent row background (all rows but the full-set row). */
  rowBg: string;
  /** Karnataka's mini-card icons use a thinner border than every other state. */
  miniCardBorderPx?: number;
}

/** Structural colours the same on every state's card. */
export const INDIA_CARD_INK = '#2B1608';
export const INDIA_CARD_GOLD = '#FFCE3F';
export const INDIA_CARD_GOLD_SHADOW = 'rgba(43, 22, 8, 0.25)';
export const INDIA_CARD_PRICE_TEXT = '#FFFDF5';
export const INDIA_CARD_CREAM = '#FFF6E0';

export const INDIA_PROPERTY_THEME: Record<PropertyColor, IndiaPropertyTheme> = {
  brown: {
    base: '#8C4A21',
    bandBg:
      'repeating-linear-gradient(45deg, rgba(255,255,255,0.1) 0px, rgba(255,255,255,0.1) 8px, transparent 8px, transparent 40px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.14) 0px, rgba(0,0,0,0.14) 8px, transparent 8px, transparent 40px) #8C4A21',
    priceBg:
      'repeating-linear-gradient(45deg, rgba(0,0,0,0.14) 0px, rgba(0,0,0,0.14) 8px, transparent 8px, transparent 40px) #8C4A21',
    badgeBg: '#2B1608',
    badgeColor: '#FFC58F',
    taglineColor: '#FFDCC0',
    priceInk: '#2B1204',
    cityColor: '#2B1608',
    priceValueShadow: '#4E2409',
    cityShadow: '#C98B5A',
    rowBg: '#FFE7C2',
  },
  light_blue: {
    base: '#2F9DBE',
    bandBg:
      'repeating-linear-gradient(0deg, rgba(255,255,255,0.16) 0px, rgba(255,255,255,0.16) 5px, transparent 5px, transparent 30px) #2F9DBE',
    priceBg:
      'repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 5px, transparent 5px, transparent 30px) #2F9DBE',
    badgeBg: '#0C3D4F',
    badgeColor: '#BDEBFA',
    taglineColor: '#D6F3FC',
    priceInk: '#062B38',
    cityColor: '#135F79',
    priceValueShadow: '#135F79',
    cityShadow: '#8FCFE0',
    rowBg: '#DFF2F8',
  },
  pink: {
    base: '#E8368F',
    bandBg: 'radial-gradient(rgba(255,255,255,0.22) 7px, transparent 8px) 0 0 / 52px 52px #E8368F',
    priceBg: 'radial-gradient(rgba(0,0,0,0.14) 6px, transparent 7px) 0 0 / 44px 44px #E8368F',
    badgeBg: '#5C0A36',
    badgeColor: '#FFC3DF',
    taglineColor: '#FFDCEC',
    priceInk: '#3D0322',
    cityColor: '#A11460',
    priceValueShadow: '#A11460',
    cityShadow: '#F5A0C8',
    rowBg: '#FDE3EF',
  },
  orange: {
    base: '#FF6B1A',
    bandBg:
      'repeating-linear-gradient(135deg, rgba(0,0,0,0.13) 0px, rgba(0,0,0,0.13) 14px, transparent 14px, transparent 36px) #FF6B1A',
    priceBg:
      'repeating-linear-gradient(135deg, rgba(0,0,0,0.13) 0px, rgba(0,0,0,0.13) 14px, transparent 14px, transparent 36px) #FF6B1A',
    badgeBg: '#5C1F00',
    badgeColor: '#FFD9A0',
    taglineColor: '#FFE6C4',
    priceInk: '#3D1500',
    cityColor: '#A33400',
    priceValueShadow: '#A33400',
    cityShadow: '#FFB47E',
    rowBg: '#FFE4CE',
  },
  red: {
    base: '#D6342C',
    bandBg:
      'repeating-radial-gradient(circle, rgba(255,255,255,0.14) 0px, rgba(255,255,255,0.14) 4px, transparent 4px, transparent 30px) #D6342C',
    priceBg:
      'repeating-radial-gradient(circle, rgba(0,0,0,0.13) 0px, rgba(0,0,0,0.13) 4px, transparent 4px, transparent 30px) #D6342C',
    badgeBg: '#4A0805',
    badgeColor: '#FFC9B8',
    taglineColor: '#FFDCD2',
    priceInk: '#330502',
    cityColor: '#8A140E',
    priceValueShadow: '#8A140E',
    cityShadow: '#F09A93',
    rowBg: '#FFDFD8',
  },
  yellow: {
    base: '#E8A50A',
    bandBg:
      'repeating-linear-gradient(90deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 4px, transparent 4px, transparent 44px) #E8A50A',
    priceBg:
      'repeating-linear-gradient(90deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 4px, transparent 4px, transparent 44px) #E8A50A',
    badgeBg: '#4A3300',
    badgeColor: '#FFE9A8',
    taglineColor: '#5C4100',
    priceInk: '#3D2A00',
    cityColor: '#9C6B00',
    priceValueShadow: '#9C6B00',
    cityShadow: '#F0CE7E',
    rowBg: '#FFF0C4',
  },
  green: {
    base: '#1E8C4E',
    bandBg:
      'repeating-linear-gradient(45deg, rgba(255,255,255,0.12) 0px, rgba(255,255,255,0.12) 8px, transparent 8px, transparent 40px) #1E8C4E',
    priceBg:
      'repeating-linear-gradient(45deg, rgba(0,0,0,0.14) 0px, rgba(0,0,0,0.14) 8px, transparent 8px, transparent 40px) #1E8C4E',
    badgeBg: '#06331A',
    badgeColor: '#B8F0CE',
    taglineColor: '#D2F7E0',
    priceInk: '#04240F',
    cityColor: '#0B4D28',
    priceValueShadow: '#0B4D28',
    cityShadow: '#84C9A0',
    rowBg: '#DDF3E4',
  },
  dark_blue: {
    base: '#16337E',
    bandBg:
      'repeating-linear-gradient(90deg, rgba(255,206,63,0.2) 0px, rgba(255,206,63,0.2) 4px, transparent 4px, transparent 44px) #16337E',
    priceBg:
      'repeating-linear-gradient(90deg, rgba(255,206,63,0.2) 0px, rgba(255,206,63,0.2) 4px, transparent 4px, transparent 44px) #16337E',
    badgeBg: '#0A1B45',
    badgeColor: '#FFCE3F',
    taglineColor: '#9FB4E8',
    priceInk: '#0A1B45',
    cityColor: '#16337E',
    priceValueShadow: '#0A1B45',
    cityShadow: '#D8AF4A',
    rowBg: '#EDE2C2',
  },
  railroad: {
    base: '#3A3733',
    bandBg:
      'repeating-linear-gradient(90deg, rgba(255,255,255,0.14) 0px, rgba(255,255,255,0.14) 6px, transparent 6px, transparent 40px) #3A3733',
    priceBg:
      'repeating-linear-gradient(90deg, rgba(255,255,255,0.1) 0px, rgba(255,255,255,0.1) 6px, transparent 6px, transparent 40px) #3A3733',
    badgeBg: '#141210',
    badgeColor: '#E8C878',
    taglineColor: '#C9BFAF',
    priceInk: '#141210',
    cityColor: '#2B2925',
    priceValueShadow: '#141210',
    cityShadow: '#A89F92',
    rowBg: '#E9E5DE',
    miniCardBorderPx: 4,
  },
  utility: {
    base: '#12797A',
    bandBg: 'radial-gradient(rgba(255,255,255,0.18) 6px, transparent 7px) 0 0 / 48px 48px #12797A',
    priceBg: 'radial-gradient(rgba(0,0,0,0.13) 6px, transparent 7px) 0 0 / 44px 44px #12797A',
    badgeBg: '#04302F',
    badgeColor: '#A8E8E2',
    taglineColor: '#CFF2EE',
    priceInk: '#032120',
    cityColor: '#063F40',
    priceValueShadow: '#063F40',
    cityShadow: '#79BFB9',
    rowBg: '#D8EFEA',
  },
};

/** Set tagline shown under the state badge (SET NAME · REGION). */
export const PROPERTY_SET_TAGLINE: Record<PropertyColor, string> = {
  brown: 'KITE SET · SABARMATI',
  light_blue: 'BACKWATER SET · MALABAR',
  pink: 'PALACE SET · THAR DESERT',
  orange: 'TEA SET · BRAHMAPUTRA',
  red: 'CHAKRA SET · KONARK COAST',
  yellow: 'GOPURAM SET · KAVERI DELTA',
  green: 'SUSEGAD SET · MANDOVI',
  dark_blue: 'GATEWAY SET · KONKAN COAST',
  railroad: 'RAILWAY SET · DECCAN LINE',
  utility: 'HERITAGE SET · GANGA YAMUNA',
};

/** Only Maharashtra (highest full-set rent in the game) carries the ribbon. */
export const PREMIUM_PROPERTY_COLOR: PropertyColor = 'dark_blue';
export const PREMIUM_RENT_CAPTION = 'HIGHEST RENT IN THE GAME';
