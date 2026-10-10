import type { PropertyColor } from '@monopoly-deal/shared';
import type { Landmark } from './types';

/** Europe: one landmark per country, on a 32-unit grid. */
export const EUROPE_LANDMARKS: Record<PropertyColor, Landmark> = {
  // Austria: two beamed eighth notes.
  brown: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <circle cx="9" cy="25" r="5.5" fill="currentColor" />
        <circle cx="23" cy="23" r="5.5" fill="currentColor" />
        <rect x="12.5" y="5" width="3" height="21" fill="currentColor" />
        <rect x="26.5" y="2" width="3" height="22" fill="currentColor" />
        <polygon points="12.5,5 29.5,1.5 29.5,6 12.5,9.5" fill="currentColor" />
      </>
    ),
  },
  // Portugal: a caravel, square sails on a single mast over a narrow hull.
  light_blue: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <rect x="4" y="6" width="8" height="12" fill="currentColor" />
        <rect x="21" y="6" width="8" height="12" fill="currentColor" />
        <rect x="15" y="3" width="3" height="18" fill="currentColor" />
        <polygon points="2,21 30,21 25,28 7,28" fill="currentColor" />
      </>
    ),
  },
  // Greece: a temple front, pediment over an entablature, four columns on a stylobate.
  pink: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <polygon points="16,1 31,8 31,11 1,11 1,8" fill="currentColor" />
        <rect x="3" y="13.5" width="4" height="14.5" fill="currentColor" />
        <rect x="10.3" y="13.5" width="4" height="14.5" fill="currentColor" />
        <rect x="17.7" y="13.5" width="4" height="14.5" fill="currentColor" />
        <rect x="25" y="13.5" width="4" height="14.5" fill="currentColor" />
        <rect x="1" y="28" width="30" height="3" fill="currentColor" />
      </>
    ),
  },
  // Germany: Brandenburg Gate, a stepped flat top carrying the quadriga block over five tall piers.
  orange: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <rect x="12" y="1" width="8" height="5" fill="currentColor" />
        <rect x="5" y="6" width="22" height="4" fill="currentColor" />
        <rect x="1" y="10" width="30" height="4" fill="currentColor" />
        <rect x="1" y="14" width="3.6" height="17" fill="currentColor" />
        <rect x="7.6" y="14" width="3.6" height="17" fill="currentColor" />
        <rect x="14.2" y="14" width="3.6" height="17" fill="currentColor" />
        <rect x="20.8" y="14" width="3.6" height="17" fill="currentColor" />
        <rect x="27.4" y="14" width="3.6" height="17" fill="currentColor" />
      </>
    ),
  },
  // UK: Big Ben, a tower with a clock face cut out and a pointed spire.
  red: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <polygon points="16,0.5 18.5,4.5 13.5,4.5" fill="currentColor" />
        <polygon points="13,4.5 19,4.5 22.5,9 9.5,9" fill="currentColor" />
        <path
          d="M9.5 9H22.5V20H21V31H11V20H9.5Z M12.4 14.5A3.6 3.6 0 1 0 19.6 14.5A3.6 3.6 0 1 0 12.4 14.5Z"
          fill="currentColor"
          fillRule="evenodd"
        />
      </>
    ),
  },
  // Spain: a bull's head, horns sweeping out and up, ears beneath them.
  yellow: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <path d="M8 13H24L21.5 23Q21 30.5 16 30.5Q11 30.5 10.5 23Z" fill="currentColor" />
        <path
          d="M10 14.5C2.5 15 1.5 8 5 2.5 M22 14.5C29.5 15 30.5 8 27 2.5"
          stroke="currentColor"
          strokeWidth="3.6"
          strokeLinecap="round"
          fill="none"
        />
        <polygon points="9,17 2.5,19.5 9.6,21.5" fill="currentColor" />
        <polygon points="23,17 29.5,19.5 22.4,21.5" fill="currentColor" />
      </>
    ),
  },
  // Italy: the Colosseum in elevation, the broken outer ring stepping down, arches in two tiers.
  green: {
    viewBox: '0 0 32 32',
    paths: (
      <path
        d="M1 30V8Q9 4.5 18 4.5V11Q25 12 31 15V30Z M3.5 18V14A2 2 0 0 1 7.5 14V18Z M10.5 18V14A2 2 0 0 1 14.5 14V18Z M3.5 27V23A2 2 0 0 1 7.5 23V27Z M10.5 27V23A2 2 0 0 1 14.5 23V27Z M17.5 27V23A2 2 0 0 1 21.5 23V27Z M24.5 27V23A2 2 0 0 1 28.5 23V27Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    ),
  },
  // France: the Eiffel Tower, a spire over a platform and legs that splay out around an arch.
  dark_blue: {
    viewBox: '0 0 32 32',
    paths: (
      <path
        d="M15 1H17L18.6 11H21.5V14H19.3Q21.5 24 27.5 31H20.5Q19.8 23.5 16 22Q12.2 23.5 11.5 31H4.5Q10.5 24 12.7 14H10.5V11H13.4Z"
        fill="currentColor"
      />
    ),
  },
  // Switzerland: the Matterhorn, one sharp asymmetric peak with a snow cap.
  railroad: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <polygon points="20,2 22.75,9 17.42,9" fill="currentColor" />
        <polygon points="16.32,12 23.93,12 31,31 1,31 9,18 13,21" fill="currentColor" />
      </>
    ),
  },
  // Netherlands: a four-bladed windmill on a tapering tower.
  utility: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <circle cx="16" cy="12" r="3" fill="currentColor" />
        <rect x="14.5" y="0" width="3" height="24" transform="rotate(45 16 12)" fill="currentColor" />
        <rect x="14.5" y="0" width="3" height="24" transform="rotate(-45 16 12)" fill="currentColor" />
        <polygon points="13,18 19,18 22,31 10,31" fill="currentColor" />
      </>
    ),
  },
};
