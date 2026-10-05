import type { ReactNode } from 'react';

/**
 * The cream, ink-bordered box the money card's scarcity pill and the Quick
 * Start card's footnote are built on. `variant` selects the per-card modifier
 * in cards.css.
 */
export function RuleBox({ variant, children }: { variant: string; children: ReactNode }) {
  return <div className={`playing-card__rulebox playing-card__rulebox--${variant}`}>{children}</div>;
}
