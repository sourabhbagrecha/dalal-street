import type { Card } from '@monopoly-deal/shared';

/**
 * The stage: a screen-space overlay over the table where cards, hands and bursts play out what the game just did
 * (choreo.ts decides what). It owns no game state — beats say what moved, the stage only draws it.
 *
 * Everything is placed in screen pixels, measured off the real DOM, so it works whatever the camera is doing:
 * - A *source* is a `Spot`, remembered from the last commit (the thing it was standing on is gone by the time the
 *   beat arrives). A spot that lay on the felt is glued to the felt, so it rides the camera as it swoops.
 * - A *destination* is `Live`, measured again every frame, so a card keeps homing on a target that is still
 *   sliding into place.
 * The real card a flight lands on is hidden until the flight arrives (see `hide`), then pops in.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tilt of the element it was measured off, in degrees (hand cards fan). */
  rot?: number;
}
export interface Pt {
  x: number;
  y: number;
}
/** A place remembered as it was. `world` spots are in felt coordinates and follow the camera. */
export interface Spot {
  rect: Rect;
  world: boolean;
}
/** A place measured afresh each frame; null while it does not exist yet. */
export type Live = () => Rect | null;

export const mid = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
export const norm = (v: Pt): Pt => {
  const d = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / d, y: v.y / d };
};
/** Compass angle a hand drawn fingertips-up must be turned by to point along `v`. */
export const pointing = (v: Pt) => (Math.atan2(v.y, v.x) * 180) / Math.PI + 90;

export const ease = {
  linear: (u: number) => u,
  in: (u: number) => u * u * u,
  out: (u: number) => 1 - (1 - u) ** 3,
  inOut: (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
  smooth: (u: number) => u * u * (3 - 2 * u),
};

/** Base sizes the actors are drawn at; poses scale them. */
export const CARD_W = 100;
const CARD_H = 140;
const GLOVE = { w: 60, h: 76 };

export interface Pose {
  x: number;
  y: number;
  /** Card width in screen px. */
  w?: number;
  /** Glove scale. */
  s?: number;
  rot?: number;
  /** 0 = back showing, 1 = face showing (flipping cards only). */
  flip?: number;
  a?: number;
  /** Glove grip, 0 open → 1 closed. */
  pinch?: number;
}

export interface Actor {
  key: string;
  kind: 'card' | 'glove';
  /** The face to show; null draws a card back. */
  card: Card | null;
  /** Cuff colour of a glove, silhouette colour of a card's trail. */
  tint: string;
  /** Starts on its back and turns face-up in flight. */
  flips: boolean;
  delay: number;
  dur: number;
  /** Stays on stage after `dur`, at its last pose, until taken or cleared. */
  hold: boolean;
  trail: number;
  trailLag: number;
  pose(t: number): Pose | null;
  done?(): void;
  // runtime
  start: number;
  begun: boolean;
  el: HTMLElement | null;
  ghosts: HTMLElement[];
  last: Pose | null;
}

type ActorSpec = Partial<Pick<Actor, 'card' | 'tint' | 'flips' | 'delay' | 'hold' | 'trail' | 'trailLag' | 'done'>> &
  Pick<Actor, 'kind' | 'dur' | 'pose'> & { key?: string };

type BurstKind = 'ring' | 'spark' | 'wave' | 'confetti' | 'dust';
export type Tone = 'gold' | 'red' | 'green' | 'ink' | 'white';

/** Elements that are not what they look like: the hidden glance panel of a seat the camera is on. */
const STAND_IN = '.tb-zone[data-lod="near"] > .tb-glance';

let serial = 0;

export class Stage {
  root: HTMLElement | null = null;
  actors: Actor[] = [];
  reduced = false;
  /** Held hands, by key: what a later beat picks up where this one left off. */
  grips = new Map<string, { dir: Pt; src: Spot; from: Spot }>();

  private listeners = new Set<() => void>();
  private snaps = new Map<string, Spot>();
  private timers = new Set<number>();
  private raf = 0;
  private hidden = new Set<string>();
  private host: HTMLElement | null = null;
  private sheet: HTMLStyleElement | null = null;
  /** The felt's transform as of this frame. */
  private felt: { x: number; y: number; k: number } | null = null;

  // ── lifecycle ──────────────────────────────────────────────────────────────

  mount(root: HTMLElement) {
    this.root = root;
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.host = document.createElement('div');
    this.host.className = 'st-host';
    this.sheet = document.createElement('style');
    root.append(this.host, this.sheet);
  }

  unmount() {
    this.clear();
    this.host?.remove();
    this.sheet?.remove();
    this.host = this.sheet = this.root = null;
  }

  /** Drop everything in flight and un-hide what it was hiding. */
  clear() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const t of this.timers) window.clearTimeout(t);
    this.timers.clear();
    this.actors = [];
    this.grips.clear();
    this.hidden.clear();
    this.paintHidden();
    if (this.host) this.host.textContent = '';
    this.emit();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  later(ms: number, fn: () => void) {
    const t = window.setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  // ── geometry ───────────────────────────────────────────────────────────────

  private origin(): Rect {
    const r = this.root!.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  get size() {
    const o = this.root?.getBoundingClientRect();
    return { w: o?.width ?? 393, h: o?.height ?? 852 };
  }

  private world(): { x: number; y: number; k: number } | null {
    const el = this.root?.querySelector<HTMLElement>('.tb-world');
    if (!el || !this.root) return null;
    const r = el.getBoundingClientRect();
    const o = this.root.getBoundingClientRect();
    return { x: r.left - o.left, y: r.top - o.top, k: r.width / (el.offsetWidth || 1) };
  }

  /** Whether `el` is in play: it has size and is not a hidden stand-in. */
  private live(el: HTMLElement): boolean {
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && !el.closest(STAND_IN);
  }

  /** The first element matching that is actually there. */
  find(sel: string): HTMLElement | null {
    for (const el of this.root?.querySelectorAll<HTMLElement>(sel) ?? []) if (this.live(el)) return el;
    return null;
  }

  /** `el` in root coordinates. Hand cards fan, so their size is read off the layout box, not the tilted outline. */
  private measure(el: HTMLElement, o: Rect): Rect {
    const r = el.getBoundingClientRect();
    const tilt = parseFloat(el.style.getPropertyValue('--r'));
    const cx = r.left + r.width / 2 - o.x;
    const cy = r.top + r.height / 2 - o.y;
    if (Number.isFinite(tilt)) {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      return { x: cx - w / 2, y: cy - h / 2, w, h, rot: tilt };
    }
    return { x: r.left - o.x, y: r.top - o.y, w: r.width, h: r.height };
  }

  rectOf(el: HTMLElement): Rect {
    return this.measure(el, this.origin());
  }

  /** What a spot is worth this frame. */
  at(sp: Spot): Rect {
    if (!sp.world) return sp.rect;
    const w = this.felt ?? this.world();
    if (!w) return sp.rect;
    const r = sp.rect;
    return { x: w.x + r.x * w.k, y: w.y + r.y * w.k, w: r.w * w.k, h: r.h * w.k, rot: r.rot };
  }

  /** Remember `el` where it is now. */
  spotOf(el: HTMLElement): Spot {
    const rect = this.rectOf(el);
    const w = el.closest('.tb-world') ? this.world() : null;
    if (!w) return { rect, world: false };
    return { rect: { x: (rect.x - w.x) / w.k, y: (rect.y - w.y) / w.k, w: rect.w / w.k, h: rect.h / w.k, rot: rect.rot }, world: true };
  }

  spot(sel: string): Spot | null {
    const el = this.find(sel);
    return el ? this.spotOf(el) : null;
  }

  /** A stand-in spot: a card-sized patch at a screen position. */
  screenSpot(x: number, y: number, w = 90): Spot {
    return { rect: { x: x - w / 2, y: y - (w * 1.4) / 2, w, h: w * 1.4 }, world: false };
  }

  /** Where the element carrying `data-cid` / `data-pay` / `data-hand` / `data-seat` / `data-peek` = key stood at the last commit. */
  snap(key: string): Spot | null {
    return this.snaps.get(key) ?? null;
  }

  /** Read every landmark; called after each commit so a beat can find what its state change just removed. */
  snapshot() {
    if (!this.root) return;
    this.felt = this.world();
    const o = this.origin();
    const next = new Map<string, Spot>();
    const put = (key: string, el: HTMLElement) => {
      if (next.has(key)) return;
      const rect = this.measure(el, o);
      const w = el.closest('.tb-world') ? this.felt : null;
      next.set(
        key,
        w
          ? { rect: { x: (rect.x - w.x) / w.k, y: (rect.y - w.y) / w.k, w: rect.w / w.k, h: rect.h / w.k, rot: rect.rot }, world: true }
          : { rect, world: false },
      );
    };
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-cid],[data-pay],[data-hand],[data-seat],[data-peek]')) {
      if (!this.live(el)) continue;
      const { cid, pay, hand, seat, peek } = el.dataset;
      if (cid) put(cid, el);
      if (pay) put(`pay:${pay}`, el);
      if (hand) put(`hand:${hand}`, el);
      if (seat) put(`seat:${seat}`, el);
      if (peek) put(peek, el);
    }
    this.snaps = next;
    this.felt = null;
  }

  /** A destination that looks for the first selector that exists, every frame. */
  target(...sels: string[]): Live {
    let cached: HTMLElement | null = null;
    return () => {
      if (!this.root) return null;
      if (!cached || !cached.isConnected || !this.live(cached)) {
        cached = null;
        for (const sel of sels) {
          cached = this.find(sel);
          if (cached) break;
        }
      }
      return cached ? this.rectOf(cached) : null;
    };
  }

  // ── hiding what a flight is about to deliver ───────────────────────────────

  hide(id: string) {
    this.hidden.add(id);
    this.paintHidden();
    this.later(4500, () => this.show(id));
  }

  show(id: string) {
    if (this.hidden.delete(id)) this.paintHidden();
  }

  private paintHidden() {
    if (this.sheet) this.sheet.textContent = [...this.hidden].map((id) => `[data-cid="${id}"]{visibility:hidden!important}`).join('');
  }

  // ── actors ─────────────────────────────────────────────────────────────────

  spawn(spec: ActorSpec): Actor {
    const a: Actor = {
      key: spec.key ?? `a${++serial}`,
      kind: spec.kind,
      card: spec.card ?? null,
      tint: spec.tint ?? '#f2c14e',
      flips: spec.flips ?? false,
      delay: spec.delay ?? 0,
      dur: spec.dur,
      hold: spec.hold ?? false,
      trail: spec.trail ?? 0,
      trailLag: spec.trailLag ?? 30,
      pose: spec.pose,
      done: spec.done,
      start: performance.now() + (spec.delay ?? 0),
      begun: false,
      el: null,
      ghosts: [],
      last: null,
    };
    this.actors = [...this.actors.filter((x) => x.key !== a.key), a];
    this.emit();
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
    return a;
  }

  /** Lift an actor off the stage without finishing it, so the next beat can carry on from it. */
  take(key: string): Actor | null {
    const a = this.actors.find((x) => x.key === key) ?? null;
    if (a) {
      this.actors = this.actors.filter((x) => x !== a);
      this.emit();
    }
    return a;
  }

  private tick = (now: number) => {
    this.raf = 0;
    this.felt = this.world();
    const finished: Actor[] = [];
    for (const a of this.actors) {
      const el = a.el;
      if (!el) continue;
      const t = now - a.start;
      if (t < 0) continue;
      const pose = a.pose(a.hold ? t : Math.min(t, a.dur));
      if (!a.begun) {
        a.begun = true;
        el.style.visibility = 'visible';
      }
      if (pose) {
        a.last = pose;
        this.paint(a, el, pose);
        a.ghosts.forEach((g, i) => {
          const lag = t - (i + 1) * a.trailLag;
          const gp = lag > 0 && t < a.dur ? a.pose(lag) : null;
          if (!gp) {
            g.style.visibility = 'hidden';
            return;
          }
          g.style.visibility = 'visible';
          const s = (gp.w ?? CARD_W) / CARD_W;
          g.style.transform = `translate3d(${gp.x - CARD_W / 2}px, ${gp.y - CARD_H / 2}px, 0) rotate(${gp.rot ?? 0}deg) scale(${s})`;
          g.style.opacity = String(0.32 / (i + 1));
        });
      } else {
        el.style.visibility = 'hidden';
      }
      if (!a.hold && t >= a.dur) finished.push(a);
    }
    this.felt = null;
    if (finished.length) {
      this.actors = this.actors.filter((a) => !finished.includes(a));
      for (const a of finished) a.done?.();
      this.emit();
    }
    if (this.actors.length) this.raf = requestAnimationFrame(this.tick);
  };

  private paint(a: Actor, el: HTMLElement, p: Pose) {
    if (a.kind === 'card') {
      const s = (p.w ?? CARD_W) / CARD_W;
      el.style.transform = `translate3d(${p.x - CARD_W / 2}px, ${p.y - CARD_H / 2}px, 0) rotate(${p.rot ?? 0}deg) scale(${s})`;
      if (a.flips) (el.firstElementChild as HTMLElement | null)?.style.setProperty('transform', `rotateY(${(p.flip ?? 1) * 180}deg)`);
    } else {
      el.style.transform = `translate3d(${p.x - GLOVE.w / 2}px, ${p.y - GLOVE.h / 2}px, 0) rotate(${p.rot ?? 0}deg) scale(${p.s ?? 1})`;
      el.style.setProperty('--pinch', String(p.pinch ?? 0));
    }
    el.style.opacity = String(p.a ?? 1);
  }

  // ── one-shot effects ───────────────────────────────────────────────────────

  private drop(node: HTMLElement, ms: number) {
    this.host?.append(node);
    this.later(ms, () => node.remove());
  }

  burst(kind: BurstKind, at: Pt, o: { color?: string; size?: number } = {}) {
    if (this.reduced) return;
    const n = document.createElement('div');
    n.className = `st-burst st-burst--${kind}`;
    n.style.left = `${at.x}px`;
    n.style.top = `${at.y}px`;
    n.style.setProperty('--c', o.color ?? '#f2c14e');
    n.style.setProperty('--size', `${o.size ?? (kind === 'wave' ? 900 : kind === 'dust' ? 70 : 130)}px`);
    const bits = kind === 'spark' ? 10 : kind === 'confetti' ? 30 : kind === 'dust' ? 6 : 0;
    for (let i = 0; i < bits; i++) {
      const b = document.createElement('i');
      // A fixed scatter — same burst every time, no dice.
      const r = ((i * 47 + 13) % 100) / 100;
      b.style.setProperty('--a', `${(i / bits) * 360 + r * 20}deg`);
      b.style.setProperty('--d', `${0.6 + r * 0.7}`);
      b.style.setProperty('--h', `${(i * 61) % 360}`);
      b.style.setProperty('--r', `${((i * 83) % 90) - 45}deg`);
      n.append(b);
    }
    this.drop(n, kind === 'confetti' ? 1700 : 900);
  }

  label(text: string, at: Pt, o: { tone?: Tone; big?: boolean } = {}) {
    const n = document.createElement('div');
    n.className = 'st-label';
    n.dataset.tone = o.tone ?? 'gold';
    if (o.big) n.dataset.big = 'true';
    n.textContent = text;
    this.drop(n, 1300);
    // Keep the whole stamp on screen: it is centred on `at`, so leave half its width either side.
    const { w, h } = this.size;
    const half = n.offsetWidth / 2 + 8;
    n.style.left = `${Math.min(w - half, Math.max(half, at.x))}px`;
    n.style.top = `${Math.min(h - 60, Math.max(70, at.y))}px`;
  }

  flash(color: string) {
    if (this.reduced) return;
    const n = document.createElement('div');
    n.className = 'st-flash';
    n.style.setProperty('--c', color);
    this.drop(n, 500);
  }

  private feltScale(el: Element): number {
    return el.closest('.tb-world') ? (this.world()?.k ?? 1) : 1;
  }

  /** A jolt that reads the same size on screen whatever the camera's zoom. */
  shake(el: Element | null, amp = 8, ms = 320) {
    if (!el || this.reduced) return;
    const a = amp / this.feltScale(el);
    const steps = [0, 0.16, 0.34, 0.52, 0.72, 1];
    el.animate(
      steps.map((o, i) => ({
        offset: o,
        translate: i === steps.length - 1 ? '0 0' : `${(i % 2 ? -1 : 1) * a * (1 - o)}px ${(i % 2 ? 1 : -1) * a * 0.45 * (1 - o)}px`,
      })),
      { duration: ms, easing: 'ease-out' },
    );
  }

  /** A coloured pulse around a seat or set. */
  glow(el: Element | null, color: string, ms = 620) {
    if (!el || this.reduced) return;
    el.animate(
      [
        { boxShadow: `0 0 0 0 ${color}00` },
        { boxShadow: `0 0 0 14px ${color}aa, 0 0 70px ${color}99`, offset: 0.22 },
        { boxShadow: `0 0 0 0 ${color}00` },
      ],
      { duration: ms, easing: 'ease-out' },
    );
  }

  pop(el: Element | null, peak = 1.24, ms = 380) {
    if (!el || this.reduced) return;
    el.animate([{ scale: '1' }, { scale: String(peak), offset: 0.35 }, { scale: '1' }], { duration: ms, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  }
}
