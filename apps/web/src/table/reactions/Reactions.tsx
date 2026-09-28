import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, MouseEvent, RefObject } from 'react';
import { REACTION_COOLDOWN_MS, REACTION_KINDS, type Reaction, type ReactionKind } from '@monopoly-deal/shared';
import { soundEngine } from '../../sound/soundEngine';
import { useChrome } from '../chrome/context';
import type { ReactionPort } from '../chrome/context';
import { PARTICLE_PATH, REACTION_STYLE, ReactionFace } from './faces';
import { hitsMe } from './hit';
import type { Beat } from '../model';

/**
 * Table reactions: a face button above the tray opens a small picker; a pick flies out of the thrower's seat on every
 * screen at the table. Pure presentation — nothing here reads or changes the game, the layer never takes a pointer,
 * and a click outside the open picker still lands on the table under it.
 *
 * Right after a beat lands that hit the viewer (rent or a debt charged to them, a property stolen, a whole set
 * raided — see `./hit.ts`), the picker pops open on its own for a few seconds: the moment the feeling is
 * freshest, a reaction is one tap away instead of something to go dig for.
 */

/** How long the auto-opened picker stays up before it closes itself if nothing was picked. */
const NUDGE_MS = 4500;

const vars = (o: Record<string, string | number>) => o as CSSProperties;

/** How long one face stays on the table, entrance to fade. Matches `rx-rise` in gl-reactions.css. */
const LIFETIME_MS = 2600;
/** Beyond this many faces in the air, the oldest makes room. */
const MAX_BURSTS = 10;
const COLS = 4;

interface Particle {
  shape: keyof typeof PARTICLE_PATH | 'puff' | 'text';
  text?: string;
  color: string;
  /** Direction of travel in degrees (0 = right, -90 = up) and how far it goes. */
  angle: number;
  dist: number;
  size: number;
  delay: number;
  spin?: number;
}

const GOLD = '#ffd23f';
const PARTICLES: Record<ReactionKind, Particle[]> = {
  happy: [
    { shape: 'star', color: GOLD, angle: -150, dist: 50, size: 14, delay: 60 },
    { shape: 'spark', color: '#fff', angle: -115, dist: 58, size: 11, delay: 120 },
    { shape: 'star', color: '#ff9f2e', angle: -65, dist: 56, size: 12, delay: 90 },
    { shape: 'spark', color: GOLD, angle: -30, dist: 50, size: 13, delay: 150 },
    { shape: 'star', color: GOLD, angle: -90, dist: 64, size: 10, delay: 200 },
  ],
  laugh: [
    { shape: 'text', text: 'HA', color: '#fff6e2', angle: -140, dist: 54, size: 17, delay: 80, spin: -18 },
    { shape: 'text', text: 'HA', color: '#ffe066', angle: -40, dist: 56, size: 20, delay: 220, spin: 14 },
    { shape: 'text', text: 'HA', color: '#fff6e2', angle: -92, dist: 66, size: 14, delay: 380, spin: -6 },
    { shape: 'drop', color: '#8fd8ff', angle: 190, dist: 40, size: 10, delay: 140 },
    { shape: 'drop', color: '#8fd8ff', angle: -10, dist: 40, size: 10, delay: 180 },
  ],
  excited: [
    { shape: 'spark', color: '#ff5a47', angle: -90, dist: 62, size: 15, delay: 40 },
    { shape: 'spark', color: GOLD, angle: -135, dist: 56, size: 13, delay: 90 },
    { shape: 'spark', color: '#3fe3c0', angle: -45, dist: 56, size: 13, delay: 90 },
    { shape: 'spark', color: '#fff', angle: 180, dist: 50, size: 11, delay: 150 },
    { shape: 'spark', color: '#fff', angle: 0, dist: 50, size: 11, delay: 150 },
    { shape: 'star', color: GOLD, angle: 140, dist: 46, size: 10, delay: 210 },
    { shape: 'star', color: '#ff8fb3', angle: 40, dist: 46, size: 10, delay: 210 },
  ],
  love: [
    { shape: 'heart', color: '#ff4f86', angle: -95, dist: 66, size: 16, delay: 60 },
    { shape: 'heart', color: '#e8173f', angle: -130, dist: 54, size: 12, delay: 200 },
    { shape: 'heart', color: '#ff8fb3', angle: -55, dist: 58, size: 13, delay: 320 },
    { shape: 'heart', color: '#e8173f', angle: -160, dist: 44, size: 9, delay: 420 },
    { shape: 'heart', color: '#ff4f86', angle: -20, dist: 46, size: 10, delay: 500 },
  ],
  shocked: [
    { shape: 'text', text: '!', color: '#fff6e2', angle: -118, dist: 52, size: 22, delay: 60, spin: -16 },
    { shape: 'text', text: '!', color: GOLD, angle: -62, dist: 54, size: 26, delay: 120, spin: 14 },
    { shape: 'spark', color: '#c9b6ff', angle: -160, dist: 46, size: 11, delay: 160 },
    { shape: 'spark', color: '#c9b6ff', angle: -20, dist: 46, size: 11, delay: 160 },
  ],
  sad: [
    { shape: 'drop', color: '#7cc4f5', angle: 105, dist: 56, size: 11, delay: 300 },
    { shape: 'drop', color: '#b8e2ff', angle: 80, dist: 64, size: 9, delay: 520 },
    { shape: 'drop', color: '#7cc4f5', angle: 125, dist: 48, size: 8, delay: 760 },
    { shape: 'drop', color: '#b8e2ff', angle: 60, dist: 50, size: 10, delay: 900 },
  ],
  angry: [
    { shape: 'puff', color: '#f3ece0', angle: -118, dist: 52, size: 16, delay: 160 },
    { shape: 'puff', color: '#ffffff', angle: -62, dist: 52, size: 14, delay: 260 },
    { shape: 'puff', color: '#e8ddcc', angle: -96, dist: 64, size: 12, delay: 420 },
    { shape: 'text', text: '#@!', color: '#ffd0bc', angle: -30, dist: 58, size: 15, delay: 300, spin: 10 },
  ],
  cool: [
    { shape: 'spark', color: '#fff', angle: -150, dist: 44, size: 14, delay: 520 },
    { shape: 'spark', color: '#d4fff2', angle: -30, dist: 46, size: 11, delay: 640 },
    { shape: 'spark', color: '#fff', angle: -95, dist: 58, size: 9, delay: 760 },
  ],
};

interface ReactionSeat {
  id: string;
  name: string;
  color: string;
  ink: string;
}

interface Burst {
  key: number;
  playerId: string;
  kind: ReactionKind;
  x: number;
  y: number;
  /** Rivals get a name tag under the face; your own does not need one. */
  seat: ReactionSeat | null;
}

interface ReactionsProps {
  /** The table's frame (`.tb`): faces are placed in its coordinates. */
  root: RefObject<HTMLElement | null>;
  /** Height of the hand tray, so the button sits just above it. */
  trayH: number;
  rivals: ReactionSeat[];
  /** The beat now on stage: watched only to notice one that just hit the viewer (see `./hit.ts`) and nudge the
   * picker open for it. */
  beat: Beat | null;
  /** Hide the button (not the faces) while the viewer is busy with a card: a pick's pills sit in the same spot. */
  busy: boolean;
  /** Extra px to clear above the tray: the rival switcher's close button sits in the same corner while a seat has the camera. */
  liftBy?: number;
}

/** The picker and every face in the air. Renders nothing where the adapter has no room to throw them in. */
export function Reactions(props: ReactionsProps) {
  const port = useChrome()?.reactions;
  if (!port) return null;
  return <ReactionsLive {...props} port={port} />;
}

function ReactionsLive({ root, trayH, rivals, beat, busy, liftBy = 0, port }: ReactionsProps & { port: ReactionPort }) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [said, setSaid] = useState('');
  const nextKey = useRef(1);
  const timers = useRef(new Set<number>());
  const dockBtn = useRef<HTMLButtonElement>(null);
  const rivalsRef = useRef(rivals);
  rivalsRef.current = rivals;

  // A beat just landed that hit the viewer: pop the picker open for a few seconds without waiting for a tap on
  // the dock button. `nudgeSeq`/`closeSeq` are one-shot signals `Dock` reacts to (open, then close itself again
  // if the moment passes unused) — never state Dock owns, so a manual open/close in between is never fought.
  const [nudgeSeq, setNudgeSeq] = useState(0);
  const [closeSeq, setCloseSeq] = useState(0);
  const lastHitBeatId = useRef<number | null>(null);
  useEffect(() => {
    if (!beat || beat.id === lastHitBeatId.current) return;
    lastHitBeatId.current = beat.id;
    if (!port.selfId || !hitsMe(beat, port.selfId)) return;
    setNudgeSeq((n) => n + 1);
    const t = window.setTimeout(() => setCloseSeq((n) => n + 1), NUDGE_MS);
    return () => window.clearTimeout(t);
  }, [beat, port.selfId]);

  useEffect(() => {
    const live = timers.current;
    return () => {
      for (const t of live) window.clearTimeout(t);
      live.clear();
    };
  }, []);

  const spawn = useCallback(
    (playerId: string, kind: ReactionKind) => {
      const frame = root.current;
      if (!frame) return;
      const self = playerId === port.selfId;
      const seat = self ? null : (rivalsRef.current.find((r) => r.id === playerId) ?? null);
      if (!self && !seat) return;
      const at = anchor(frame, self ? dockBtn.current : frame.querySelector(`.tb-world [data-seat="${CSS.escape(playerId)}"]`), self);
      if (!at) return;
      const key = nextKey.current++;
      setBursts((prev) => {
        // A seat reacting again while its last face is still up: fan them out a little rather than stack them.
        const mine = prev.filter((b) => b.playerId === playerId).length;
        const b: Burst = { key, playerId, kind, x: at.x + [0, 26, -26][mine % 3]!, y: at.y - (mine % 2) * 12, seat };
        return [...prev, b].slice(-MAX_BURSTS);
      });
      setSaid(`${seat ? seat.name : 'You'}: ${REACTION_STYLE[kind].label}`);
      soundEngine.play('reaction');
      const t = window.setTimeout(() => {
        timers.current.delete(t);
        setBursts((prev) => prev.filter((b) => b.key !== key));
      }, LIFETIME_MS);
      timers.current.add(t);
    },
    [root, port.selfId],
  );

  useEffect(
    () =>
      port.subscribe((r: Reaction) => {
        // Your own face went up the moment you threw it; the room's echo would be a second one.
        if (r.playerId !== port.selfId) spawn(r.playerId, r.kind);
      }),
    [port, spawn],
  );

  const throwFace = useCallback(
    (kind: ReactionKind) => {
      if (port.selfId) spawn(port.selfId, kind);
      port.send(kind);
    },
    [port, spawn],
  );

  return (
    <>
      <div className="rx-layer" aria-hidden>
        {bursts.map((b) => (
          <BurstView key={b.key} burst={b} />
        ))}
      </div>
      <span className="rx-sr" role="status" aria-live="polite">
        {said}
      </span>
      <Dock btnRef={dockBtn} bottom={trayH + 14 + liftBy} busy={busy} nudgeSeq={nudgeSeq} closeSeq={closeSeq} onThrow={throwFace} />
    </>
  );
}

/**
 * Where a face appears, in the frame's coordinates: just above your own button, or over a rival's seat. A seat the
 * camera has pushed off screen still gets its face, pinned to the edge of the view nearest to it.
 */
function anchor(frame: HTMLElement, target: Element | null, self: boolean): { x: number; y: number } | null {
  if (!target) return null;
  const f = frame.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  // Far enough in from the sides that the halo and the particles are not cut off by the frame.
  if (self) return { x: clamp(r.left - f.left + r.width / 2 + 28, 56, f.width - 56), y: r.top - f.top - 46 };
  const cam = frame.querySelector('.tb-cam')?.getBoundingClientRect() ?? f;
  const x = r.left + r.width / 2;
  const y = r.top + Math.min(r.height / 2, 56);
  return {
    x: clamp(x, cam.left + 56, cam.right - 56) - f.left,
    y: clamp(y, cam.top + 48, cam.bottom - 64) - f.top,
  };
}

function BurstView({ burst }: { burst: Burst }) {
  const { kind, seat } = burst;
  return (
    <div className="rx-burst" data-kind={kind} style={vars({ left: burst.x, top: burst.y, '--glow': REACTION_STYLE[kind].glow })}>
      <div className="rx-burst__rise" data-testid={`reaction-burst-${burst.playerId}`} data-reaction={kind}>
        <div className="rx-burst__pop">
          <i className="rx-burst__ring" />
          <i className="rx-burst__ring rx-burst__ring--late" />
          {PARTICLES[kind].map((p, i) => (
            <ParticleView key={i} p={p} />
          ))}
          <span className="rx-burst__face">
            <ReactionFace kind={kind} size={64} />
          </span>
        </div>
        {seat && (
          <span className="rx-burst__name" style={vars({ '--seat': seat.color, '--seat-ink': seat.ink })}>
            {seat.name}
          </span>
        )}
      </div>
    </div>
  );
}

function ParticleView({ p }: { p: Particle }) {
  const a = (p.angle * Math.PI) / 180;
  const style = vars({
    '--tx': `${(Math.cos(a) * p.dist).toFixed(1)}px`,
    '--ty': `${(Math.sin(a) * p.dist).toFixed(1)}px`,
    '--d': `${p.delay}ms`,
    '--sz': `${p.size}px`,
    '--spin': `${p.spin ?? (p.angle > -90 ? 25 : -25)}deg`,
    '--c': p.color,
  });
  if (p.shape === 'text') {
    return (
      <b className="rx-p rx-p--text" style={style}>
        {p.text}
      </b>
    );
  }
  if (p.shape === 'puff') return <i className="rx-p rx-p--puff" style={style} />;
  return (
    <svg className="rx-p" style={style} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d={PARTICLE_PATH[p.shape]} fill={p.color} stroke="#1b0f08" strokeWidth={p.shape === 'spark' ? 0 : 1.6} strokeLinejoin="round" />
    </svg>
  );
}

/** The face button and its picker. One tap opens, one tap throws; a tap anywhere else just closes it. */
function Dock({
  btnRef,
  bottom,
  busy,
  nudgeSeq,
  closeSeq,
  onThrow,
}: {
  btnRef: RefObject<HTMLButtonElement | null>;
  bottom: number;
  busy: boolean;
  /** Ticks up once per beat that just hit the viewer: pops the picker open unasked. */
  nudgeSeq: number;
  /** Ticks up when a nudge's time is up: closes the picker again if the viewer never acted on it. */
  closeSeq: number;
  onThrow(kind: ReactionKind): void;
}) {
  const [open, setOpen] = useState(false);
  const [nudging, setNudging] = useState(false);
  const [cooling, setCooling] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const viaKeys = useRef(false);

  useEffect(() => {
    if (busy) setOpen(false);
  }, [busy]);

  // One-shot signals from a beat that just hit the viewer (see ReactionsLive): pop the picker open on its own,
  // and close it again if the moment passes with nothing picked. Guarded so the very first render (both start
  // at 0) never opens or closes anything on mount.
  const seenNudge = useRef(0);
  useEffect(() => {
    if (nudgeSeq === seenNudge.current) return;
    seenNudge.current = nudgeSeq;
    setOpen(true);
    setNudging(true);
  }, [nudgeSeq]);
  const seenClose = useRef(0);
  useEffect(() => {
    if (closeSeq === seenClose.current) return;
    seenClose.current = closeSeq;
    setOpen(false);
  }, [closeSeq]);
  // The glow is only ever about a picker that opened on its own; once it closes, for whatever reason (a pick,
  // Escape, a tap elsewhere, going busy, or its own timeout), the highlight goes with it.
  useEffect(() => {
    if (!open) setNudging(false);
  }, [open]);

  // Any press outside closes the picker — and still does whatever it was pressed for.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  useEffect(() => {
    if (open && viaKeys.current) menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [open]);

  useEffect(() => {
    if (!cooling) return;
    const t = window.setTimeout(() => setCooling(0), REACTION_COOLDOWN_MS);
    return () => window.clearTimeout(t);
  }, [cooling]);

  const pick = (kind: ReactionKind) => {
    if (cooling) return;
    onThrow(kind);
    setCooling((n) => n + 1);
    setOpen(false);
    if (viaKeys.current) btnRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
      btnRef.current?.focus();
      return;
    }
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS }[e.key];
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (!step || at < 0) return;
    e.preventDefault();
    items[(at + step + items.length) % items.length]?.focus();
  };

  return (
    <div ref={boxRef} className="rx-dock" data-busy={busy} data-nudge={nudging || undefined} style={{ bottom }} onKeyDown={onKeyDown}>
      {nudging && (
        <span className="rx-sr" role="status" aria-live="assertive">
          React to what just happened?
        </span>
      )}
      {open && (
        <div ref={menuRef} className="rx-menu" role="menu" aria-label="Reactions" data-testid="reaction-menu" data-nudge={nudging || undefined}>
          {REACTION_KINDS.map((kind, i) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              className="rx-menu__item"
              data-kind={kind}
              data-testid={`reaction-${kind}`}
              style={vars({ '--i': i })}
              disabled={!!cooling}
              onClick={() => pick(kind)}
            >
              <ReactionFace kind={kind} size={40} />
              <small>{REACTION_STYLE[kind].label}</small>
            </button>
          ))}
        </div>
      )}
      <button
        ref={btnRef}
        type="button"
        className="rx-dock__btn"
        data-testid="reaction-btn"
        data-open={open}
        aria-label="React"
        aria-haspopup="menu"
        aria-expanded={open}
        tabIndex={busy ? -1 : undefined}
        onClick={(e: MouseEvent) => {
          viaKeys.current = e.detail === 0;
          setOpen((o) => !o);
        }}
      >
        <ReactionFace kind="happy" size={30} />
        {cooling > 0 && (
          <svg key={cooling} className="rx-dock__cool" style={vars({ '--cool': `${REACTION_COOLDOWN_MS}ms` })} viewBox="0 0 48 48" aria-hidden focusable="false">
            <circle cx="24" cy="24" r="21" pathLength="100" />
          </svg>
        )}
      </button>
    </div>
  );
}
