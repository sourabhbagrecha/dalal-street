import { useId } from 'react';
import type { ReactNode } from 'react';
import type { ReactionKind } from '@monopoly-deal/shared';

/**
 * The reaction faces: hand-drawn SVG in the table's sticker language (ink outline, glossy fill), so they look the same
 * on every phone instead of whatever emoji font the OS ships. Each face names its moving parts (`rx-f__*`) and
 * gl-reactions.css animates them only while the face is on stage or under a finger.
 */

const INK = '#1b0f08';
const MOUTH = '#7a1f1a';
const TONGUE = '#ff7a8a';

interface FaceStyle {
  label: string;
  /** Skin gradient: highlight, body, shade. */
  skin: [string, string, string];
  /** The halo and particles that burst around the face on the table. */
  glow: string;
}

export const REACTION_STYLE: Record<ReactionKind, FaceStyle> = {
  happy: { label: 'Happy', skin: ['#fff6b8', '#ffd23f', '#e8961a'], glow: '#ffd23f' },
  laugh: { label: 'LOL', skin: ['#fff0a0', '#ffc43a', '#e5801a'], glow: '#ffb02e' },
  excited: { label: 'Excited', skin: ['#fff7c2', '#ffdf4a', '#f09a22'], glow: '#ff5a47' },
  love: { label: 'Love', skin: ['#ffe0ea', '#ff8fb3', '#d63d72'], glow: '#ff4f86' },
  shocked: { label: 'Shocked', skin: ['#f6f2ff', '#c9b6ff', '#8065dd'], glow: '#a98bff' },
  sad: { label: 'Sad', skin: ['#e0f3ff', '#7cc4f5', '#347fc4'], glow: '#5eb4ff' },
  angry: { label: 'Angry', skin: ['#ffd0bc', '#ff6b4a', '#b82217'], glow: '#ff4a2e' },
  cool: { label: 'Cool', skin: ['#d4fff2', '#4fe0b8', '#17937a'], glow: '#3fe3c0' },
};

/** Material's heart, in a 24-unit box. */
const HEART = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

const line = { fill: 'none', stroke: INK, strokeWidth: 3.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function Cheeks({ y = 40, o = 0.55 }: { y?: number; o?: number }) {
  return (
    <g fill="#ff5f6d" opacity={o}>
      <ellipse cx="15.5" cy={y} rx="4.6" ry="3" />
      <ellipse cx="48.5" cy={y} rx="4.6" ry="3" />
    </g>
  );
}

/** Each face's features, drawn over the shared skin. `id` scopes the few gradients and clips a face needs. */
const FEATURES: Record<ReactionKind, (id: string) => ReactNode> = {
  happy: () => (
    <>
      <path className="rx-f__eyes" d="M17 30q5.5-7 11 0M36 30q5.5-7 11 0" {...line} />
      <Cheeks />
      <path d="M19 38.5q13 15 26 0z" fill={MOUTH} stroke={INK} strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M25.5 45.5q6.5-4.5 13 0q-6.5 4-13 0z" fill={TONGUE} />
    </>
  ),
  laugh: () => (
    <>
      <path className="rx-f__eyes" d="M16.5 24.5l9 5-9 5M47.5 24.5l-9 5 9 5" {...line} />
      <path d="M15.5 37h33q-1.5 17-16.5 17t-16.5-17z" fill={MOUTH} stroke={INK} strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M17.2 38.6h29.6q-.3 3.6-1 4.6h-27.6q-.7-1-1-4.6z" fill="#fff" />
      <ellipse cx="32" cy="48.5" rx="8" ry="4.2" fill={TONGUE} />
      <g className="rx-f__tears" fill="#8fd8ff" stroke={INK} strokeWidth="1.8" strokeLinejoin="round">
        <path d="M9.5 27.5q-5 6-2 9.2t7-1.2q.6-4.4-5-8z" />
        <path d="M54.5 27.5q5 6 2 9.2t-7-1.2q-.6-4.4 5-8z" />
      </g>
    </>
  ),
  excited: () => (
    <>
      <g className="rx-f__eyes" fill="#ff5a47" stroke={INK} strokeWidth="2" strokeLinejoin="round">
        <path d={star(22.5, 28, 8)} />
        <path d={star(41.5, 28, 8)} />
      </g>
      <Cheeks y={41} o={0.45} />
      <path d="M20 39h24q-1 13-12 13t-12-13z" fill={MOUTH} stroke={INK} strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M21.6 40.4h20.8q-.3 2.6-.9 3.4h-19q-.6-.8-.9-3.4z" fill="#fff" />
      <path d="M26 48.4q6-4 12 0q-6 3.6-12 0z" fill={TONGUE} />
    </>
  ),
  love: () => (
    <>
      <g className="rx-f__eyes" fill="#e8173f" stroke={INK} strokeWidth="2.6" strokeLinejoin="round">
        <g transform="translate(13.2 19.5) scale(0.66)">
          <path d={HEART} />
        </g>
        <g transform="translate(35 19.5) scale(0.66)">
          <path d={HEART} />
        </g>
      </g>
      <g fill="#fff" opacity="0.8">
        <ellipse cx="18.5" cy="25" rx="2" ry="1.4" />
        <ellipse cx="40.3" cy="25" rx="2" ry="1.4" />
      </g>
      <Cheeks y={41.5} o={0.5} />
      <path d="M22.5 41.5q9.5 9 19 0" {...line} />
    </>
  ),
  shocked: () => (
    <>
      <path className="rx-f__brows" d="M15.5 17.5q6-5 12-1.5M48.5 17.5q-6-5-12-1.5" {...line} />
      <g className="rx-f__eyes">
        <ellipse cx="22.5" cy="27.5" rx="6.4" ry="7.4" fill="#fff" stroke={INK} strokeWidth="2.6" />
        <ellipse cx="41.5" cy="27.5" rx="6.4" ry="7.4" fill="#fff" stroke={INK} strokeWidth="2.6" />
        <circle cx="22.5" cy="28.5" r="2.8" fill={INK} />
        <circle cx="41.5" cy="28.5" r="2.8" fill={INK} />
      </g>
      <ellipse className="rx-f__mouth" cx="32" cy="46" rx="6.2" ry="8" fill="#5a1414" stroke={INK} strokeWidth="2.8" />
      <ellipse cx="32" cy="50.5" rx="3.6" ry="2.4" fill={TONGUE} />
    </>
  ),
  sad: () => (
    <>
      <path d="M15.5 25.5l10-5.5M48.5 25.5l-10-5.5" {...line} />
      <g fill={INK}>
        <ellipse cx="22" cy="31" rx="3.4" ry="4.2" />
        <ellipse cx="42" cy="31" rx="3.4" ry="4.2" />
      </g>
      <g fill="#fff">
        <circle cx="23.2" cy="29.4" r="1.3" />
        <circle cx="43.2" cy="29.4" r="1.3" />
      </g>
      <path className="rx-f__mouth" d="M23 48.5q9-8.5 18 0" {...line} />
      <path className="rx-f__tear" d="M20.5 36q-4.5 6.5-2 9.6t6.4-.6q.9-4-4.4-9z" fill="#c9eeff" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
    </>
  ),
  angry: () => (
    <>
      <path className="rx-f__brows" d="M14.5 20.5l13 7M49.5 20.5l-13 7" {...line} strokeWidth="3.8" />
      <g fill={INK}>
        <path d="M17.5 29.5q5 1.8 10 1.6q-.6 4.6-5 4.6t-5-6.2z" />
        <path d="M46.5 29.5q-5 1.8-10 1.6q.6 4.6 5 4.6t5-6.2z" />
      </g>
      <rect x="20.5" y="40" width="23" height="10" rx="3.5" fill="#fff" stroke={INK} strokeWidth="2.6" />
      <path d="M20.5 45h23M26.3 40v10M32 40v10M37.7 40v10" stroke={INK} strokeWidth="1.6" />
      <path className="rx-f__vein" d="M47 8.5q2 3-.5 5.5M52.5 10q-3 2-5.5-.5M53 16q-2-3 .5-5.5M47.5 14.5q3-2 5.5.5" fill="none" stroke="#8a0f08" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  cool: (id) => (
    <>
      <defs>
        <linearGradient id={`${id}-lens`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2f5c" />
          <stop offset="1" stopColor="#0d0a14" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <path d="M12.5 24.5h17q0 11.5-8.5 11.5t-8.5-11.5zM34.5 24.5h17q0 11.5-8.5 11.5t-8.5-11.5z" />
        </clipPath>
      </defs>
      <path d="M10 24.5h44" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
      <path
        d="M12.5 24.5h17q0 11.5-8.5 11.5t-8.5-11.5zM34.5 24.5h17q0 11.5-8.5 11.5t-8.5-11.5z"
        fill={`url(#${id}-lens)`}
        stroke={INK}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <g clipPath={`url(#${id}-clip)`}>
        <path className="rx-f__shine" d="M8 38l10-16h5l-10 16zM30 38l10-16h5l-10 16z" fill="#fff" opacity="0.55" />
      </g>
      <path d="M23.5 45.5q9 5.5 17.5-3" {...line} />
    </>
  ),
};

/** One reaction face at `size` px. Decorative: whoever places it says what it means. */
export function ReactionFace({ kind, size }: { kind: ReactionKind; size: number }) {
  const id = `rx${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [hi, mid, lo] = REACTION_STYLE[kind].skin;
  return (
    <svg className="rx-f" data-kind={kind} width={size} height={size} viewBox="0 0 64 64" aria-hidden focusable="false">
      <defs>
        <radialGradient id={`${id}-skin`} cx="0.38" cy="0.3" r="0.78">
          <stop offset="0" stopColor={hi} />
          <stop offset="0.55" stopColor={mid} />
          <stop offset="1" stopColor={lo} />
        </radialGradient>
      </defs>
      <circle cx="32" cy="33" r="27.5" fill={`url(#${id}-skin)`} stroke={INK} strokeWidth="3" />
      <ellipse cx="22" cy="16.5" rx="9" ry="4.6" fill="#fff" opacity="0.5" transform="rotate(-24 22 16.5)" />
      {FEATURES[kind](id)}
    </svg>
  );
}

/** The bits that fly off a face when it lands on the table, in a 24-unit box. */
export const PARTICLE_PATH = {
  heart: HEART,
  spark: 'M12 0C12.6 7 17 11.4 24 12 17 12.6 12.6 17 12 24 11.4 17 7 12.6 0 12 7 11.4 11.4 7 12 0z',
  drop: 'M12 2S5 10.5 5 15a7 7 0 0 0 14 0c0-4.5-7-13-7-13z',
  star: star(12, 12.5, 11.5),
} as const;
