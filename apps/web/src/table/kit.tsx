import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import type { Card, PropertySet } from '@monopoly-deal/shared';
import { WIN_SETS } from '@monopoly-deal/shared';
import { useNavigate } from 'react-router-dom';
import { PlayingCard } from '../components/card/PlayingCard';
import { soundEngine } from '../sound/soundEngine';
import { theme } from '../theme';
import { useCurrency } from '../hooks/useCurrency';
import { useWinSequence } from './live/winSequence';
import type { WinStep } from './live/winSequence';
import { urgencyOf } from './live/useSecondsLeft';
import type { Fx, Seat, TableGame } from './model';
import { allSeats, bankTotal, completeCount, isComplete, seatById, stateName } from './model';
import type { GameRecap } from './recap';

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
  cardTestId,
}: {
  set: PropertySet;
  w: number;
  step: number;
  className?: string;
  /** Makes each card individually pickable (target mode). */
  onCard?: (card: Card) => void;
  /** Per-card target state: 'pick' pulses gold, 'hit' pulses red (aimed at you), 'dim' fades, 'tap' is tappable without a pulse (wild flip), 'sel' is that, chosen. */
  mark?: (card: Card) => 'pick' | 'dim' | 'hit' | 'tap' | 'sel' | undefined;
  /** Test id for a pickable card (only cards `mark` calls 'pick', 'tap' or 'sel'). */
  cardTestId?: (card: Card) => string | undefined;
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
          {...(onCard && (mark?.(c) === 'pick' || mark?.(c) === 'tap' || mark?.(c) === 'sel')
            ? {
                'data-testid': cardTestId?.(c),
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
  const { currency } = useCurrency();
  return (
    <div className={`gl-back ${className}`} style={vars({ '--card-w': `${w}px` })}>
      <span>{currency.symbol}</span>
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
  info: (
    <>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 10.5v6M12 7v1.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
  zoomOut: <path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5" stroke="currentColor" strokeWidth="3" fill="none" />,
  gear: (
    <path
      d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
      fill="currentColor"
    />
  ),
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
  // The drain is two half-ring arcs, each in its own half-window, turned with `rotate` (a compositor-only property):
  // animating stroke-dashoffset instead restyles and repaints the SVG every frame, ~100 style recalcs/s on an idle table.
  // Right half covers 0–180° (clockwise from 12 o'clock), left half 180–360°; the angle swept is 360 × value.
  const sweep = 360 * Math.max(0, Math.min(1, value));
  const mid = size / 2;
  // Butt-capped arcs, with the moving end's round cap drawn as a dot in its own unclipped layer that turns with it
  // (a real round cap would leak out of the window at the half's other end). The left half only shows past 180°.
  const half = (side: 'r' | 'l', rot: number) => {
    const shown = side === 'r' ? sweep > 0 : sweep > 180;
    const vis = { width: size, height: size, visibility: shown ? ('visible' as const) : ('hidden' as const) };
    const turn = { rotate: `${rot}deg` };
    return (
      <>
        <span className={`gl-ring__half gl-ring__half--${side}`} style={vis}>
          <span className="gl-ring__turn" style={turn}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
              <circle
                cx={mid}
                cy={mid}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={stroke}
                strokeDasharray={`${c / 2} ${c}`}
                strokeDashoffset={side === 'r' ? 0 : -c / 2}
                transform={`rotate(-90 ${mid} ${mid})`}
              />
            </svg>
          </span>
        </span>
        <span className="gl-ring__half" style={vis}>
          <span className="gl-ring__turn" style={turn}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
              <circle cx={mid} cy={side === 'r' ? size - stroke / 2 : stroke / 2} r={stroke / 2} fill={color} />
            </svg>
          </span>
        </span>
      </>
    );
  };
  return (
    <span className={`gl-ring ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={mid} cy={mid} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {/* The round cap the arc starts with at 12 o'clock, which sits outside both half-windows' arcs. */}
        {sweep > 0 && <circle cx={mid} cy={stroke / 2} r={stroke / 2} fill={color} />}
      </svg>
      {half('r', Math.min(sweep, 180) - 180)}
      {half('l', Math.max(sweep, 180) - 360)}
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

/**
 * Which ends of a scroller still have content past them, for a fade cue in place of a scrollbar. Reads nothing
 * while `active` is false (the element is not scrolling at all). A new `key` (the ref moved to another element) reads afresh.
 */
export function useScrollMore<T extends HTMLElement>(active: boolean, key?: string): [RefObject<T | null>, 'up' | 'down' | 'both' | undefined] {
  const ref = useRef<T>(null);
  const [more, setMore] = useState<'up' | 'down' | 'both'>();
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const read = () => {
      const up = el.scrollTop > 1;
      const down = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      setMore(up && down ? 'both' : up ? 'up' : down ? 'down' : undefined);
    };
    read();
    el.addEventListener('scroll', read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', read);
      ro.disconnect();
    };
  }, [active, key]);
  return [ref, active ? more : undefined];
}

/**
 * A thin countdown bar for a surface with its own server deadline (the Just Say No alert, the pay tray) — the
 * top-bar ring is easy to miss while looking at the banner or the cards, so the banner carries its own clock too.
 * `data-urgency` ('warn' at ≤10s, 'critical' at ≤5s) drives the CSS pulse; nothing renders once the deadline is gone.
 */
export function Countdown({ secs, maxSecs, className = '' }: { secs: number | null; maxSecs: number; className?: string }) {
  if (secs === null) return null;
  const pct = maxSecs > 0 ? Math.max(0, Math.min(1, secs / maxSecs)) : 0;
  return (
    <div className={`tb-countdown ${className}`} data-urgency={urgencyOf(secs)} role="timer" aria-label={`${secs} seconds left`}>
      <i style={vars({ '--pct': `${pct * 100}%` })} aria-hidden />
      <b>{secs}</b>
    </div>
  );
}

/** The current one-shot effect, or null once it has played out. */
export function useFx(g: TableGame, ms = 1900): Fx | null {
  const [live, setLive] = useState<Fx | null>(null);
  useEffect(() => {
    if (!g.fx) return;
    setLive(g.fx);
    const t = window.setTimeout(() => setLive(null), ms);
    return () => window.clearTimeout(t);
  }, [g.fx, ms]);
  return live;
}

const RAIN_PIECES = Array.from({ length: 28 }, (_, i) => i);

/** Confetti, reused by both the celebration steps and (for the winner only) the summary card. */
function Rain() {
  return (
    <div className="gl-victory__rain" aria-hidden>
      {RAIN_PIECES.map((i) => (
        <i key={i} style={vars({ '--i': i, '--x': `${(i * 37) % 100}%`, '--h': (i * 47) % 360 })} />
      ))}
    </div>
  );
}

/**
 * One beat of the win celebration (`table/live/winSequence.ts`): intro, the winner's name, then one beat
 * per full set they won with. Tapping anywhere, or the Skip pill, jumps straight to the summary.
 */
function WinCelebration({ step, winnerName, mine, onSkip }: { step: WinStep; winnerName: string; mine: boolean; onSkip: () => void }) {
  return (
    <div
      className="gl-victory gl-win"
      role="alert"
      data-testid="win-overlay"
      data-winner={mine ? 'you' : 'rival'}
      data-step={step.kind}
      onClick={onSkip}
    >
      <div className="gl-win__rays" aria-hidden />
      {mine && step.kind !== 'intro' && <Rain />}
      <button
        type="button"
        className="gl-win__skip"
        data-testid="win-skip"
        onClick={(e) => {
          e.stopPropagation();
          onSkip();
        }}
      >
        Skip
      </button>
      {step.kind === 'name' && (
        <div className="gl-win__name">
          <span className="gl-win__eyebrow">WINNER</span>
          <b>{mine ? 'You win!' : `${winnerName} wins!`}</b>
        </div>
      )}
      {step.kind === 'set' && (
        <div className="gl-win__set" style={vars({ '--c': theme.propertyColors[step.set.color] ?? '#888' })}>
          <span className="gl-win__count">
            {step.index + 1} of {step.total}
          </span>
          <b className="gl-win__setname">{stateName(step.set.color)}</b>
          <SetStack set={step.set} w={72} step={24} className="gl-win__stack" />
        </div>
      )}
    </div>
  );
}

/**
 * The general game state once the celebration has run (or been skipped, or this is a reload into an
 * already-finished game — see `useWinSequence`): the winner, their full sets, standings for the whole
 * table, and the whole-game recap. "Deal again" only exists where a new game can be dealt from here
 * (`actions.reset`: /demo, the mock); a networked room gets "Rematch" instead (`actions.requestRematch`),
 * gated on every seat tapping it (`TableGame.rematch`). "View table" hands the felt back without losing
 * this card — `Results` (below) brings it back.
 */
function WinSummary({
  g,
  recap,
  winner,
  mine,
  full,
  onViewTable,
}: {
  g: TableGame;
  recap?: GameRecap | null;
  winner: Seat | undefined;
  mine: boolean;
  full: PropertySet[];
  onViewTable: () => void;
}) {
  const navigate = useNavigate();
  const standings = allSeats(g)
    .slice()
    .sort((a, b) => {
      if (a.id === winner?.id) return -1;
      if (b.id === winner?.id) return 1;
      return completeCount(b.sets) - completeCount(a.sets) || bankTotal(b.bank) - bankTotal(a.bank);
    });
  return (
    <div className="gl-victory" role="alert" data-testid="win-overlay" data-winner={mine ? 'you' : 'rival'} data-step="summary">
      {mine && <Rain />}
      <div className="gl-victory__card">
        <span className="gl-victory__eyebrow">
          WINNER · {full.length} FULL SET{full.length === 1 ? '' : 'S'}
        </span>
        <b>{mine ? 'You win!' : `${winner?.name ?? 'Someone'} wins!`}</b>
        {!mine && (
          <p className="gl-victory__you">
            You had {completeCount(g.me.sets)} of {WIN_SETS} sets · {theme.formatMoney(bankTotal(g.me.bank))} in the bank
          </p>
        )}
        {full.length > 0 && (
          <div className="gl-victory__sets" aria-label={full.map((s) => stateName(s.color)).join(', ')}>
            {full.map((s) => (
              <i key={s.id} title={stateName(s.color)} style={vars({ '--c': theme.propertyColors[s.color] ?? '#888' })} />
            ))}
          </div>
        )}
        <ul className="gl-win__standings" aria-label="Standings">
          {standings.map((s) => (
            <li key={s.id} data-me={s.id === g.me.id ? '' : undefined}>
              <span className="gl-win__standings-name">
                {s.id === winner?.id && <Icon name="crown" className="gl-win__standings-crown" />}
                {s.name}
              </span>
              <span className="gl-win__standings-sets">
                {completeCount(s.sets)}/{WIN_SETS}
              </span>
              <span className="gl-win__standings-bank">{theme.formatMoney(bankTotal(s.bank))}</span>
            </li>
          ))}
        </ul>
        {recap && (
          <ul className="gl-victory__recap" aria-label="Game recap">
            <li>{recap.turns} turn{recap.turns === 1 ? '' : 's'}</li>
            {recap.biggestRent && (
              <li>
                Biggest rent: {theme.formatMoney(recap.biggestRent.amount)}
                {' · '}
                {seatById(g, recap.biggestRent.byId)?.name ?? 'Someone'} charged{' '}
                {seatById(g, recap.biggestRent.fromId)?.name ?? 'someone'}
              </li>
            )}
            {recap.steals > 0 && <li>{recap.steals} steal{recap.steals === 1 ? '' : 's'} made</li>}
            {recap.jsnSaves > 0 && <li>{recap.jsnSaves} Just Say No save{recap.jsnSaves === 1 ? '' : 's'}</li>}
          </ul>
        )}
        <div className="gl-victory__acts">
          {g.actions.reset && (
            <button type="button" data-testid="restart-btn" onClick={g.actions.reset}>
              Deal again
            </button>
          )}
          {g.actions.requestRematch && (
            <button
              type="button"
              data-testid="rematch-btn"
              disabled={g.rematch?.mine}
              onClick={g.actions.requestRematch}
            >
              {g.rematch?.mine
                ? `Waiting for the table… (${g.rematch.readyCount}/${g.rematch.totalSeats})`
                : g.rematch && g.rematch.readyCount > 0
                  ? `Rematch (${g.rematch.readyCount}/${g.rematch.totalSeats} ready)`
                  : 'Rematch'}
            </button>
          )}
          <button type="button" data-testid="view-table-btn" data-quiet="" onClick={onViewTable}>
            View table
          </button>
          <button
            type="button"
            data-testid="back-to-lobby-btn"
            data-quiet={g.actions.reset || g.actions.requestRematch ? '' : undefined}
            onClick={() => navigate('/')}
          >
            Back to lobby
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Whole-screen win state, in three views: the celebration (`WinCelebration`), the general game state
 * (`WinSummary`), and — once "View table" is tapped — nothing but a `Results` pill, so the final table
 * underneath (`TableScreen` keeps rendering it; the engine rejects every command once there's a winner)
 * is free to look at. Owns the win/lose sound too: it plays once, the moment the summary is first shown,
 * whichever way that happened (the celebration finished, was skipped, or never ran — see `useWinSequence`).
 */
export function Victory({
  g,
  recap,
  revealedWinnerId,
}: {
  g: TableGame;
  recap?: GameRecap | null;
  revealedWinnerId: string | null;
}) {
  const winner = revealedWinnerId ? seatById(g, revealedWinnerId) : undefined;
  const mine = revealedWinnerId === g.me.id;
  const full = (winner?.sets ?? []).filter(isComplete);
  const { step, skip } = useWinSequence(revealedWinnerId, full);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (revealedWinnerId === null) setShowTable(false);
  }, [revealedWinnerId]);

  const soundPlayedFor = useRef<string | null>(null);
  useEffect(() => {
    if (revealedWinnerId === null) {
      soundPlayedFor.current = null;
      return;
    }
    if (step || soundPlayedFor.current === revealedWinnerId) return;
    soundPlayedFor.current = revealedWinnerId;
    soundEngine.play(mine ? 'win' : 'lose');
  }, [revealedWinnerId, step, mine]);

  if (!revealedWinnerId) return null;

  if (showTable) {
    return (
      <button type="button" className="gl-win-results" data-testid="results-btn" onClick={() => setShowTable(false)}>
        <Icon name="crown" /> Results
      </button>
    );
  }

  if (step) {
    return <WinCelebration step={step} winnerName={winner?.name ?? 'Someone'} mine={mine} onSkip={skip} />;
  }

  return <WinSummary g={g} recap={recap} winner={winner} mine={mine} full={full} onViewTable={() => setShowTable(true)} />;
}
