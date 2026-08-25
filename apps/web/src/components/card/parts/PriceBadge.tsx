import type { CSSProperties } from 'react';
import { theme } from '../../../theme';
import type { BadgePalette } from '../palettes';

/**
 * The corner price badge every card carries — one geometry for all six kinds
 * (see `.playing-card__badge` in cards.css: 200×226 on the 750×1050 reference,
 * 8px ink borders right+bottom, 24/0/34 radius, ₹ value in Lilita One 132px,
 * "CR" in Archivo 900 57px, a 120×6 underline bar). Only colours vary, and
 * they arrive as a palette.
 *
 * Long values: a three-character value ("₹10") does not fit the 200px badge
 * at 132px, so any value of 3+ characters takes the `--long` variant (value
 * 110px, 6px taller badge so the bar keeps its gap). That is the one size
 * rule, and it lives here — faces never pass a size.
 */
const LONG_VALUE_CHARS = 3;

interface PriceBadgeProps {
  /** The card's ₹ value. */
  value: number;
  palette: BadgePalette;
  /** Joker only: a diagonal strike bar drawn across the "₹0". */
  strike?: boolean;
}

export function PriceBadge({ value, palette, strike }: PriceBadgeProps) {
  const text = `${theme.currencySymbol}${value}`;
  const long = text.length >= LONG_VALUE_CHARS;
  const { bg, stripeOpacity, valueColor, shadowColor, shadowOffsetY = 8, crColor, barColor, textStroke } = palette;
  // Only the four-band rainbow badge (ANY_BADGE) sets this: no flat fill
  // clears contrast against every band, so value/CR each get a dark ring
  // instead — see the WebkitTextStroke width note on `.playing-card__badge-value`.
  const strokeStyle = textStroke
    ? ({ WebkitTextStroke: `calc(2.4px * var(--card-scale)) ${textStroke}`, paintOrder: 'stroke fill' } as CSSProperties)
    : undefined;
  return (
    <div
      className={`playing-card__badge${long ? ' playing-card__badge--long' : ''}`}
      style={{
        background: bg,
        // Only set when striped: React's style diffing applies object keys
        // in order, so an explicit `backgroundImage: undefined` here would
        // run *after* `background` above and clear the image layer a
        // gradient `bg` had just set via that shorthand.
        ...(stripeOpacity === undefined
          ? {}
          : {
              backgroundImage: `repeating-linear-gradient(45deg, rgba(0,0,0,${stripeOpacity}) 0 calc(16px * var(--card-scale)), transparent calc(16px * var(--card-scale)) calc(40px * var(--card-scale)))`,
            }),
      }}
    >
      <div
        className="playing-card__badge-value"
        style={{
          color: valueColor,
          textShadow: `0 calc(${shadowOffsetY}px * var(--card-scale)) 0 ${shadowColor}`,
          ...strokeStyle,
        }}
      >
        {text}
        {strike && <span className="playing-card__badge-strike" aria-hidden />}
      </div>
      <div className="playing-card__badge-cr" style={{ color: crColor, ...strokeStyle }}>
        {theme.currencySuffix.toUpperCase()}
      </div>
      <div className="playing-card__badge-bar" style={{ background: barColor }} />
    </div>
  );
}
