import type { PropertyColor } from '@monopoly-deal/shared';
import type { Landmark } from './types';

/** A filled dot as a path, for use as a hole under evenodd. */
const dot = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

/** United States: one state emblem per colour group, on a 32-unit grid. */
export const USA_LANDMARKS: Record<PropertyColor, Landmark> = {
  // Tennessee: acoustic guitar, figure-eight body with the sound hole cut in the lower bout only.
  brown: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <path
          d="M8 23A8 8 0 1 0 24 23A8 8 0 1 0 8 23Z M10 16A6 6 0 1 0 22 16A6 6 0 1 0 10 16Z M13.5 26A2.5 2.5 0 1 1 18.5 26A2.5 2.5 0 1 1 13.5 26Z"
          fill="currentColor"
        />
        <rect x="14" y="5" width="4" height="12" fill="currentColor" />
        <rect x="12" y="1" width="8" height="5" fill="currentColor" />
      </>
    ),
  },
  // Colorado: one tall peak with a jagged snow line cut across it, and a foothill in front.
  light_blue: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <polygon points="19,2 23.4,12 21,10.5 19,13.5 16.8,10.5 13.8,12" fill="currentColor" />
        <polygon points="12.3,15 16.8,13.5 19,16.5 21,13.5 24.8,15 31,30 4.5,30" fill="currentColor" />
        <polygon points="8,16 15,30 1,30" fill="currentColor" />
      </>
    ),
  },
  // Texas: the five-pointed lone star.
  pink: {
    viewBox: '0 0 32 32',
    paths: (
      <polygon
        points="16,2 19.64,11.98 30.27,12.37 21.9,18.92 24.82,29.14 16,23.2 7.18,29.14 10.1,18.92 1.73,12.37 12.36,11.98"
        fill="currentColor"
      />
    ),
  },
  // Nevada: a die showing five pips, the pips cut out as holes.
  orange: {
    viewBox: '0 0 32 32',
    paths: (
      <path
        d={`M3 3H29V29H3Z${dot(9, 9, 3)}${dot(23, 9, 3)}${dot(16, 16, 3)}${dot(9, 23, 3)}${dot(23, 23, 3)}`}
        fill="currentColor"
        fillRule="evenodd"
      />
    ),
  },
  // Hawaii: a volcano with a notched crater and a puff above it, over a wave at its foot.
  red: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <circle cx="16" cy="4.5" r="3.5" fill="currentColor" />
        <polygon points="1,23 11.5,9 14.5,12.5 17.5,12.5 20.5,9 31,23" fill="currentColor" />
        <path
          d="M1.5 28.5 Q5.1 24.5 8.75 28.5 T16 28.5 T23.25 28.5 T30.5 28.5"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </>
    ),
  },
  // Florida: a palm with its broad fronds in front of a sun.
  yellow: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <circle cx="25" cy="8" r="5.5" fill="currentColor" />
        <polygon points="6,31 10,31 13.5,15 10.5,15" fill="currentColor" />
        <path d="M12 13 Q5 6 1 11 Q6 9 12 13 Z" fill="currentColor" />
        <path d="M12 13 Q10 4 15 2 Q13 8 12 13 Z" fill="currentColor" />
        <path d="M12 13 Q18 12 19 18 Q14 16 12 13 Z" fill="currentColor" />
        <path d="M12 13 Q4 15 3 20 Q9 17 12 13 Z" fill="currentColor" />
      </>
    ),
  },
  // California: suspension bridge, two towers, a deck and sweeping cables.
  green: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <rect x="7" y="4" width="4" height="26" fill="currentColor" />
        <rect x="21" y="4" width="4" height="26" fill="currentColor" />
        <rect x="1" y="20" width="30" height="3" fill="currentColor" />
        <path d="M1 18 Q5 6 9 6 Q16 19 23 6 Q27 6 31 18" stroke="currentColor" strokeWidth="3" fill="none" />
      </>
    ),
  },
  // New York: the Statue of Liberty's torch, a full flame over a flared cup and a tapering handle.
  dark_blue: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <path d="M16 1 C24 8 23 12 20 15 H12 C9 12 8 8 16 1 Z" fill="currentColor" />
        <polygon points="6,17 26,17 22,22 10,22" fill="currentColor" />
        <polygon points="12.5,22 19.5,22 17.5,31 14.5,31" fill="currentColor" />
      </>
    ),
  },
  // Arizona: saguaro cactus with two arms.
  railroad: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <rect x="13" y="6" width="6" height="25" fill="currentColor" />
        <circle cx="16" cy="6" r="3" fill="currentColor" />
        <rect x="6" y="14" width="7" height="4" fill="currentColor" />
        <rect x="6" y="8" width="4" height="10" fill="currentColor" />
        <rect x="19" y="18" width="7" height="4" fill="currentColor" />
        <rect x="22" y="11" width="4" height="11" fill="currentColor" />
      </>
    ),
  },
  // Massachusetts: a banded lighthouse, its lantern throwing two rays to either side.
  utility: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <polygon points="16,1 20.5,5 11.5,5" fill="currentColor" />
        <rect x="13" y="5" width="6" height="6" fill="currentColor" />
        <rect x="10" y="10.5" width="12" height="3" fill="currentColor" />
        <polygon points="12.3,13.5 19.7,13.5 20.3,19.5 11.7,19.5" fill="currentColor" />
        <polygon points="11.4,22.5 20.6,22.5 21.5,31 10.5,31" fill="currentColor" />
        <path
          d="M10 6.5 L3 4 M10 9 L3 11.5 M22 6.5 L29 4 M22 9 L29 11.5"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />
      </>
    ),
  },
};
