import type { ReactNode } from 'react';
import type { PropertyColor } from '@monopoly-deal/shared';
import { INDIA_CARD_INK } from '../indiaPropertyTheme';

/**
 * One small glyph per state, shown twice on a property card's band (a small
 * badge icon and a large translucent flourish) — traced from the approved
 * design. Fill is `currentColor` so callers set colour via the wrapping
 * <svg>'s `style.color`, matching the two sizes it's used at.
 */
const LANDMARK_PATHS: Record<PropertyColor, { viewBox: string; paths: ReactNode }> = {
  brown: {
    viewBox: '0 0 32 40',
    paths: (
      <>
        <polygon points="16,2 30,16 16,30 2,16" fill="currentColor" />
        <path d="M16 30 Q20 35 16 39" stroke="currentColor" strokeWidth="3" fill="none" />
      </>
    ),
  },
  light_blue: {
    viewBox: '0 0 32 34',
    paths: (
      <>
        <polygon points="15,2 15,19 28,19" fill="currentColor" />
        <path d="M2 22 Q16 29 30 22 L26 29 Q16 33 6 29 Z" fill="currentColor" />
      </>
    ),
  },
  pink: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <path d="M8 18 A8 8 0 0 1 24 18 Z" fill="currentColor" />
        <rect x="5" y="18" width="22" height="12" fill="currentColor" />
        <rect x="2" y="12" width="4" height="18" fill="currentColor" />
        <rect x="26" y="12" width="4" height="18" fill="currentColor" />
      </>
    ),
  },
  orange: {
    viewBox: '0 0 32 38',
    paths: (
      <>
        <path d="M16 2 C28 8 30 24 16 36 C2 24 4 8 16 2 Z" fill="currentColor" />
        <line x1="16" y1="8" x2="16" y2="32" stroke="#00000055" strokeWidth="3" />
      </>
    ),
  },
  red: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="4" />
        <circle cx="16" cy="16" r="4" fill="currentColor" />
        <line x1="16" y1="3" x2="16" y2="29" stroke="currentColor" strokeWidth="3" />
        <line x1="3" y1="16" x2="29" y2="16" stroke="currentColor" strokeWidth="3" />
        <line x1="7" y1="7" x2="25" y2="25" stroke="currentColor" strokeWidth="3" />
        <line x1="25" y1="7" x2="7" y2="25" stroke="currentColor" strokeWidth="3" />
      </>
    ),
  },
  yellow: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <polygon points="16,1 25,11 7,11" fill="currentColor" />
        <rect x="9" y="12" width="14" height="8" fill="currentColor" />
        <rect x="5" y="21" width="22" height="10" fill="currentColor" />
      </>
    ),
  },
  green: {
    viewBox: '0 0 32 34',
    paths: (
      <>
        <rect x="14" y="14" width="4" height="18" fill="currentColor" />
        <path d="M16 15 Q6 5 1 10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path d="M16 15 Q26 5 31 10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path d="M16 14 Q16 4 22 1" stroke="currentColor" strokeWidth="4" fill="none" />
        <path d="M16 14 Q16 4 10 1" stroke="currentColor" strokeWidth="4" fill="none" />
      </>
    ),
  },
  dark_blue: {
    viewBox: '0 0 40 36',
    paths: (
      <>
        <rect x="2" y="6" width="8" height="28" fill="currentColor" />
        <rect x="30" y="6" width="8" height="28" fill="currentColor" />
        <path d="M12 34 V20 A8 8 0 0 1 28 20 V34" stroke="currentColor" strokeWidth="5" fill="none" />
        <polygon points="20,0 24,6 16,6" fill="currentColor" />
      </>
    ),
  },
  railroad: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="4" />
        <circle cx="16" cy="16" r="4" fill="currentColor" />
        <line x1="16" y1="4" x2="16" y2="28" stroke="currentColor" strokeWidth="3" />
        <line x1="4" y1="16" x2="28" y2="16" stroke="currentColor" strokeWidth="3" />
      </>
    ),
  },
  utility: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <path d="M6 18 A10 10 0 0 1 26 18 L26 30 L6 30 Z" fill="currentColor" />
        <line x1="16" y1="2" x2="16" y2="7" stroke="currentColor" strokeWidth="3" />
        <circle cx="16" cy="8" r="2.5" fill="currentColor" />
      </>
    ),
  },
};

export function PropertyLandmark({
  color,
  className,
}: {
  color: PropertyColor;
  className?: string;
}) {
  const def = LANDMARK_PATHS[color];
  return (
    <svg className={className} viewBox={def.viewBox} aria-hidden focusable="false">
      {def.paths}
    </svg>
  );
}

/** The corner "PROPERTY" plate icon — same house shape on every state, only
    its two fills (roof/body ink, door accent) change. */
export function PropertyHouseIcon({ ink, accent }: { ink: string; accent: string }) {
  return (
    <svg
      className="playing-card__pcard-house-icon"
      viewBox="0 0 40 36"
      aria-hidden
      focusable="false"
    >
      <polygon points="20,1 39,15 1,15" fill={ink} />
      <rect x="7" y="16" width="26" height="19" fill={ink} />
      <rect x="16" y="23" width="8" height="12" fill={accent} />
    </svg>
  );
}

/** The full-set row's star — always the structural ink colour, regardless of state. */
export function PropertyStarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 38" aria-hidden focusable="false">
      <polygon
        points="20,1 25,14 39,14 28,23 32,37 20,29 8,37 12,23 1,14 15,14"
        fill={INDIA_CARD_INK}
      />
    </svg>
  );
}
