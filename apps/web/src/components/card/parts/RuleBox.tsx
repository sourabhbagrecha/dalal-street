import type { ReactNode } from 'react';

/**
 * The cream, ink-bordered rule box a card closes on. `variant` selects the
 * per-card modifier in cards.css — its vertical position and, for a few,
 * a non-default border colour, background or shape (the money card's gold
 * pill and the Joker's inline box are variants of this same part).
 */
export function RuleBox({ variant, children }: { variant: string; children: ReactNode }) {
  return <div className={`playing-card__rulebox playing-card__rulebox--${variant}`}>{children}</div>;
}

/** The smaller second line inside a two-line rule box (House/Hotel/Just Say
 *  No) — colour is per-card, so it comes in as a prop rather than a class. */
export function RuleSub({ color, spaced, children }: { color: string; spaced?: boolean; children: ReactNode }) {
  return (
    <span
      className="playing-card__rulebox-sub"
      style={{ color, letterSpacing: spaced ? 'calc(2px * var(--card-scale))' : undefined }}
    >
      {children}
    </span>
  );
}
