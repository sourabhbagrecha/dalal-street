import type { ReactNode } from 'react';
import type { PropertyColor } from '@monopoly-deal/shared';
import type { Landmark } from './types';

/** Classic has no geography: the eight plain colour groups share one house, drawn once. */
const house: ReactNode = (
  <>
    <polygon points="16,2 30,15 2,15" fill="currentColor" />
    <path d="M6 15H26V30H6Z M13 21H19V30H13Z" fill="currentColor" fillRule="evenodd" />
  </>
);

const HOUSE: Landmark = { viewBox: '0 0 32 32', paths: house };

/** Classic: the original Atlantic City board's colour groups, with its railroad and utility emblems. */
export const CLASSIC_LANDMARKS: Record<PropertyColor, Landmark> = {
  brown: HOUSE,
  light_blue: HOUSE,
  pink: HOUSE,
  orange: HOUSE,
  red: HOUSE,
  yellow: HOUSE,
  green: HOUSE,
  dark_blue: HOUSE,
  // Steam locomotive in side profile: chimney, boiler, cab, three wheels.
  railroad: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <rect x="5" y="6" width="4" height="6" fill="currentColor" />
        <rect x="4" y="12" width="18" height="8" fill="currentColor" />
        <rect x="21" y="4" width="10" height="16" fill="currentColor" />
        <circle cx="9" cy="27" r="3.5" fill="currentColor" />
        <circle cx="18" cy="27" r="3.5" fill="currentColor" />
        <circle cx="27" cy="27" r="3.5" fill="currentColor" />
      </>
    ),
  },
  // Lightbulb: a round globe over a neck and a base.
  utility: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <circle cx="16" cy="12" r="10" fill="currentColor" />
        <polygon points="11,20 21,20 19,24 13,24" fill="currentColor" />
        <rect x="12" y="27" width="8" height="4" fill="currentColor" />
      </>
    ),
  },
};
