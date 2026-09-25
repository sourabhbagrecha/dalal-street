import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import type { Card, PropertySet } from '@monopoly-deal/shared';
import { PlayingCard } from '../../components/PlayingCard';
import type { Fx, MockGame } from './mockGame';
import { completeCount } from './mockGame';

/** Shared building blocks for the layout studies: real cards at a chosen width, fanned set stacks, icons. */

const vars = (o: Record<string, string | number>) => o as CSSProperties;

/** A real card at a fixed width. Never sets a height — the 5:7 ratio is the card's own. */
export function Cd({
  card,
  w,
  rentCount,
  className = '',
  style,
}: {
  card: Card;
  w: number;
  rentCount?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`gl-cd ${className}`} style={{ ...vars({ '--card-w': `${w}px` }), ...style }}>
      <PlayingCard
        card={card}
        rentCount={rentCount}
        activeColor={card.kind === 'property_wild' ? card.assignedColor : undefined}
      />
    </div>
  );
}

/** A property set as overlapping real cards, oldest at the back. `step` is the px offset between cards. */
export function SetStack({
  set,
  w,
  step,
  className = '',
  onCard,
  mark,
}: {
  set: PropertySet;
  w: number;
  step: number;
  className?: string;
  /** Makes each card individually pickable (target mode). */
  onCard?: (card: Card) => void;
  /** Per-card target state: 'pick' pulses gold, 'hit' pulses red (aimed at you), 'dim' fades. */
  mark?: (card: Card) => 'pick' | 'dim' | 'hit' | undefined;
}) {
  const n = set.cards.length;
  return (
    <div
      className={`gl-stack ${className}`}
      style={{ ...vars({ '--card-w': `${w}px` }), width: w + (n - 1) * step, height: (w * 7) / 5 }}
    >
      {set.cards.map((c, i) => (
        <div
          key={c.id}
          className="gl-stack__c"
          data-cid={c.id}
          style={{ left: i * step, zIndex: i }}
          data-mark={mark?.(c)}
          {...(onCard && mark?.(c) === 'pick'
            ? {
                role: 'button',
                tabIndex: 0,
                onClick: () => onCard(c),
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') onCard(c);
                },
              }
            : {})}
        >
          <PlayingCard
            card={c}
            rentCount={n}
            activeColor={c.kind === 'property_wild' ? c.assignedColor : undefined}
          />
        </div>
      ))}
      {(set.house || set.hotel) && (
        <span className="gl-stack__bld" style={{ zIndex: 20 }}>
          <Icon name={set.hotel ? 'hotel' : 'house'} />
        </span>
      )}
    </div>
  );
}

/** Face-down card back, for hands and decks. */
export function CardBack({ w, className = '' }: { w: number; className?: string }) {
  return (
    <div className={`gl-back ${className}`} style={vars({ '--card-w': `${w}px` })}>
      <span>₹</span>
    </div>
  );
}

const PATHS: Record<string, ReactNode> = {
  coin: (
    <>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M8.5 8h7M8.5 11h7M10 8c3.5 0 3.5 5 0 5H9l5 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  house: <path d="M3 11.5 12 4l9 7.5V20h-6v-6H9v6H3z" fill="currentColor" />,
  hotel: (
    <path d="M5 21V4h9v5h5v12h-4v-4h-2v4zM8 7v2h2V7zm0 4v2h2v-2zm7 1v2h2v-2z" fill="currentColor" fillRule="evenodd" />
  ),
  bolt: <path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="currentColor" />,
  star: <path d="m12 2 3 6.9 7.4.7-5.6 4.9 1.7 7.3L12 17.8l-6.5 3.9 1.7-7.3L1.6 9.6l7.4-.7z" fill="currentColor" />,
  crown: <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="currentColor" />,
  shield: (
    <path d="M12 2 4 5v6c0 5 3.4 8.7 8 11 4.6-2.3 8-6 8-11V5z" fill="currentColor" />
  ),
  x: <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  swap: <path d="M4 8h13l-3-3m6 11H7l3 3" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  info: (
    <>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 10.5v6M12 7v1.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />,
  chat: <path d="M4 5h16v11H10l-5 4v-4H4z" fill="currentColor" />,
  plus: <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />,
  chevron: <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
};

export function Icon({ name, size, className = '' }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg
      className={`gl-icon ${className}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** A circular countdown. `value` is 0..1 remaining. */
export function Ring({
  value,
  size,
  stroke = 4,
  color = 'currentColor',
  track = 'rgba(255,255,255,.2)',
  children,
  className = '',
}: {
  value: number;
  size: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className={`gl-ring ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      {children && <span className="gl-ring__in">{children}</span>}
    </span>
  );
}

/** Live content box of an element, for layouts that size things by measure. */
export function useBox<T extends HTMLElement>(fallback = { w: 393, h: 700 }): [RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [box, setBox] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setBox((b) => {
        const w = el.clientWidth || fallback.w;
        const h = el.clientHeight || fallback.h;
        return b.w === w && b.h === h ? b : { w, h };
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback.w, fallback.h]);
  return [ref, box];
}

export const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

/** The current one-shot effect, or null once it has played out. */
export function useFx(g: MockGame, ms = 1900): Fx | null {
  const [live, setLive] = useState<Fx | null>(null);
  useEffect(() => {
    if (!g.fx) return;
    setLive(g.fx);
    const t = window.setTimeout(() => setLive(null), ms);
    return () => window.clearTimeout(t);
  }, [g.fx, ms]);
  return live;
}

/** Whole-screen win state with confetti; every layout shares it. */
export function Victory({ g }: { g: MockGame }) {
  if (!g.won) return null;
  const pieces = Array.from({ length: 28 }, (_, i) => i);
  return (
    <div className="gl-victory" role="alert">
      <div className="gl-victory__rain" aria-hidden>
        {pieces.map((i) => (
          <i key={i} style={vars({ '--i': i, '--x': `${(i * 37) % 100}%`, '--h': (i * 47) % 360 })} />
        ))}
      </div>
      <div className="gl-victory__card">
        <span className="gl-victory__eyebrow">{completeCount(g.me.sets)} FULL SETS</span>
        <b>You win!</b>
        <button type="button" onClick={g.actions.reset}>
          Deal again
        </button>
      </div>
    </div>
  );
}
