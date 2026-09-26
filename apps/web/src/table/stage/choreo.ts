import type { Card } from '@monopoly-deal/shared';
import { theme } from '../../theme';
import type { Beat } from '../model';
import { CARD_W, clamp01, dist, ease, lerp, mid, norm, pointing } from './stage';
import type { Actor, Live, Pose, Pt, Rect, Spot, Stage, Tone } from './stage';

/**
 * What each beat looks like on the table. Every scene is a handful of flights and effects on a shared clock (ms
 * from the beat); the game state has already moved, so the scene only decides how the change is shown.
 *
 * Cards in flight are the real card faces. A card that lands is hidden in the table until the flight gets there
 * (Stage.hide), so the arrival is the card itself settling into place, not a copy vanishing.
 */

export interface Ctx {
  stage: Stage;
  /** A seat's colour. */
  tint(seatId: string): string;
  /** Where the player let go of a card they dragged, if they did. */
  dropped(cardId: string): Spot | null;
  /** Ask the camera to look at `cam` for `ms`. */
  hold(cam: string, ms: number): void;
  /** The viewer's seat id. */
  me: string;
}

const GOLD = '#f2c14e';
const RED = '#ff5a48';
const GREEN = '#6bd68d';
const money = theme.formatMoney;

interface Fly {
  card: Card | null;
  from: Spot;
  to: Live;
  dur: number;
  delay?: number;
  /** Px the path bows upward at its midpoint. */
  arc?: number;
  /** Px wider than its size the card swells at the apex, so it reads at table zoom. */
  boost?: number;
  /** Degrees the card leans into the throw at the apex. */
  tilt?: number;
  /** Full spins on the way. */
  turns?: number;
  flips?: boolean;
  /** Share of the flight over which a flipping card turns over. */
  flipWin?: [number, number];
  ease?: (u: number) => number;
  /** Floor for the card's on-screen width: cards on a zoomed-out table are tiny. */
  minW?: number;
  trail?: number;
  tint?: string;
  land?: (at: Rect) => void;
}

// ── a card the viewer has put down, before the server has heard of it ──

/** The stage key of the card parked for `cardId` while its command is on the wire. */
export const parkKey = (cardId: string) => `sent:${cardId}`;

interface Glide {
  key?: string;
  card: Card;
  from: Spot;
  to: Live;
  dur: number;
  arc: number;
  /** Stays on stage, at its target, after it arrives. */
  hold?: boolean;
  land?: (at: Rect) => void;
}

/** One card gliding from a remembered spot to a live target. */
function glide(s: Stage, g: Glide): Actor {
  let last: Rect | null = null;
  return s.spawn({
    kind: 'card',
    card: g.card,
    key: g.key,
    dur: g.dur,
    hold: g.hold,
    pose: (t) => {
      const u = clamp01(t / g.dur);
      const k = ease.out(u);
      const a = s.at(g.from);
      const to = g.to() ?? last ?? a;
      last = to;
      const p0 = mid(a);
      const p1 = mid(to);
      return {
        x: lerp(p0.x, p1.x, k),
        y: lerp(p0.y, p1.y, k) - g.arc * Math.sin(Math.PI * k),
        w: lerp(Math.max(a.w, 46), Math.max(to.w, 46), k),
        rot: lerp(a.rot ?? 0, to.rot ?? 0, k),
      };
    },
    done: () => g.land?.(last ?? s.at(g.from)),
  });
}

/**
 * The viewer let go of a card: it goes where they put it, at once, and waits there for the server. No beat has
 * played yet — the game has not moved — so this is only the card standing where the viewer's hand put it. When the
 * game does move, the beat for it settles this very card (see `lay` / `toss`); when the server refuses, `bounce`.
 */
export function park(s: Stage, o: { card: Card; from: Spot; to: Live }) {
  if (s.reduced || !s.root) return;
  glide(s, { key: parkKey(o.card.id), card: o.card, from: o.from, to: o.to, dur: 240, arc: 36, hold: true });
}

/** The server said no: the parked card flies back into the hand, which already has its place ready. */
export function bounce(s: Stage, card: Card, from: Spot, to: Live) {
  if (s.reduced || !s.root) return;
  // The real card is back in the hand at once; it stays out of sight until this copy gets there.
  s.hide(card.id);
  glide(s, {
    card,
    from,
    to,
    dur: 360,
    arc: 30,
    land: () => {
      s.show(card.id);
      const el = s.find(`[data-cid="${card.id}"]`);
      s.shake(el, 5, 260);
    },
  });
}

export function perform(b: Beat, cx: Ctx): void {
  const s = cx.stage;
  const ME = cx.me;
  if (b.kind === 'reset') {
    s.clear();
    return;
  }
  if (s.reduced || !s.root) return;

  // ── where things are ──
  const size = s.size;
  const bottom = (): Spot => s.screenSpot(size.w / 2, size.h - 92);
  const seatSpot = (id: string): Spot => s.snap(`seat:${id}`) ?? s.spot(`[data-seat="${id}"]`) ?? s.screenSpot(size.w / 2, size.h / 2);
  const handSpot = (id: string): Spot => (id === ME ? bottom() : (s.snap(`hand:${id}`) ?? s.spot(`[data-hand="${id}"]`) ?? seatSpot(id)));
  const bankSpot = (id: string): Spot => s.snap(`bank:${id}`) ?? s.spot(`[data-peek="bank:${id}"]`) ?? seatSpot(id);
  /** A card of yours that has just left the hand: where it was let go, else where it sat. */
  const cardSpot = (c: Card): Spot => cx.dropped(c.id) ?? s.snap(c.id) ?? bottom();
  const throwFrom = (by: string, c: Card): Spot => (by === ME ? cardSpot(c) : handSpot(by));
  const seatNow = (id: string) => s.target(`[data-seat="${id}"]`);
  const bankNow = (id: string) => s.target(`[data-peek="bank:${id}"] .cash-pile`, `[data-peek="bank:${id}"]`, `[data-seat="${id}"]`);
  const setNow = (seat: string, setId: string) => s.target(`[data-peek="set:${seat}:${setId}"]`, `[data-seat="${seat}"]`);
  const cardNow = (c: Card, seat: string, setId?: string) =>
    s.target(`[data-cid="${c.id}"]`, ...(setId ? [`[data-peek="set:${seat}:${setId}"]`] : []), `[data-seat="${seat}"]`);
  const el = (sel: string) => s.find(sel);
  const cam = () => el('.tb-cam');
  const tone = (by: string): Tone => (by === ME ? 'gold' : 'red');

  // ── building blocks ──

  function fly(f: Fly): Actor {
    const minW = f.minW ?? 44;
    const [f0, f1] = f.flipWin ?? [0.2, 0.65];
    const e = f.ease ?? ease.out;
    let last: Rect | null = null;
    return s.spawn({
      kind: 'card',
      card: f.card,
      flips: f.flips,
      delay: f.delay,
      dur: f.dur,
      trail: f.trail,
      tint: f.tint,
      pose: (t) => {
        const u = clamp01(t / f.dur);
        const k = e(u);
        const a = s.at(f.from);
        const to = f.to() ?? last ?? a;
        last = to;
        const p0 = mid(a);
        const p1 = mid(to);
        const bump = Math.sin(Math.PI * u);
        return {
          x: lerp(p0.x, p1.x, k),
          y: lerp(p0.y, p1.y, k) - (f.arc ?? 0) * Math.sin(Math.PI * k),
          w: lerp(Math.max(a.w, minW), Math.max(to.w, minW), k) + (f.boost ?? 0) * bump,
          rot: lerp(a.rot ?? 0, to.rot ?? 0, k) + (f.tilt ?? 0) * bump + (f.turns ?? 0) * 360 * k,
          flip: f.flips ? clamp01((u - f0) / (f1 - f0)) : 1,
        };
      },
      done: () => f.land?.(last ?? s.at(f.from)),
    });
  }

  /** A card that has arrived: the real one appears where the flight ended, with a pop. */
  const arrive = (c: Card, then?: (at: Rect) => void) => (at: Rect) => {
    s.show(c.id);
    s.pop(el(`[data-cid="${c.id}"]`));
    then?.(at);
  };

  /**
   * The viewer's own card was parked where it goes while the server thought about it (`park`). It is already there:
   * take it off the stage and let `land` do what its arrival does, with no second flight to wait for.
   */
  function settle(c: Card, land: (at: Rect) => void): boolean {
    const a = s.actors.find((x) => x.key === parkKey(c.id));
    if (!a) return false;
    const p = a.last;
    s.take(a.key);
    const w = p?.w ?? CARD_W;
    land(p ? { x: p.x - w / 2, y: p.y - (w * 1.4) / 2, w, h: w * 1.4, rot: p.rot } : s.at(bottom()));
    return true;
  }

  /** A thrown card to the discard pile. */
  function toss(c: Card, from: Spot, delay = 0) {
    const landed = (at: Rect) => {
      s.show(c.id);
      s.pop(el('[data-fly="discard"]'), 1.12, 300);
      s.burst('dust', mid(at));
    };
    if (delay === 0 && settle(c, landed)) return;
    s.hide(c.id);
    fly({
      card: c,
      from,
      to: s.target('[data-fly="discard"]'),
      dur: 340,
      delay,
      arc: 50,
      boost: 26,
      tilt: 16,
      ease: ease.inOut,
      minW: 60,
      land: landed,
    });
  }

  /** An action card slammed onto `to`. Resolves its own impact. */
  function slam(c: Card, from: Spot, to: Live, dur: number, hit: (at: Rect) => void, delay = 0) {
    fly({ card: c, from, to, dur, delay, arc: 80, boost: 44, tilt: -14, ease: ease.in, minW: 60, land: hit });
  }

  /** Coins (or any cards) from one bank to another, staggered, with a pop on each arrival. */
  function carryCash(cards: Card[], from: Spot, to: Live, delay: number, gap = 90, toEl?: () => Element | null): number {
    cards.forEach((c, j) =>
      fly({
        card: c,
        from,
        to,
        delay: delay + j * gap,
        dur: 560,
        arc: 110,
        boost: 18,
        turns: j % 2 ? -1 : 1,
        minW: 34,
        trail: 2,
        land: (at) => {
          s.pop(toEl?.() ?? null, 1.18, 300);
          s.burst('dust', mid(at), { color: GREEN, size: 60 });
        },
      }),
    );
    return delay + Math.max(0, cards.length - 1) * gap + 560;
  }

  // ── the hand: reaching in, grabbing, hauling a card away ──
  const OFF = 34;
  const REACH = 220;
  const GRIP = 90;
  const CARRY = 340;
  const EXIT = 170;

  /**
   * A gloved hand reaches from `from` to the card standing at `src`, grips it and hauls it to `dest`; the card
   * travels with it on the same clock. With `held`, the hand is already gripping (see `grab`) and skips the reach.
   */
  function snatch(o: {
    card: Card;
    src: Spot;
    from: Spot;
    dest: Live;
    tint: string;
    held?: { dir: Pt; src: Spot; from: Spot } | null;
    delay?: number;
    land(at: Rect): void;
  }) {
    const held = o.held ?? null;
    const src = held?.src ?? o.src;
    const from = held?.from ?? o.from;
    // Times are ms from the beat. A hand that already has hold skips the reach and grips at once.
    const gStart = held ? 0 : (o.delay ?? 200);
    const reached = held ? 0 : gStart + REACH;
    const gripEnd = reached + GRIP;
    const carryEnd = gripEnd + CARRY;
    let dir: Pt = held?.dir ?? { x: 0, y: -1 };
    let frozen = !!held;
    let lastDest: Rect | null = null;

    const cardAt = () => mid(s.at(src));
    /** The card's pose while hauled; the glove reads it too, so they never part. */
    const hauled = (t: number) => {
      const r = s.at(src);
      const c = mid(r);
      const w0 = Math.max(r.w, 44);
      const lift = ease.out(clamp01((t - reached) / GRIP));
      const start = { x: c.x, y: c.y - 10 * lift, w: w0 * (1 + 0.12 * lift), rot: -7 * lift };
      const v = clamp01((t - gripEnd) / CARRY);
      if (v <= 0) return start;
      const d = o.dest() ?? lastDest ?? r;
      lastDest = d;
      const k = ease.out(v);
      const p1 = mid(d);
      return {
        x: lerp(start.x, p1.x, k),
        y: lerp(start.y, p1.y, k) - 60 * Math.sin(Math.PI * k),
        w: lerp(start.w, Math.max(d.w, 44), k) + 30 * Math.sin(Math.PI * v),
        rot: lerp(start.rot, d.rot ?? 0, k) + 8 * Math.sin(Math.PI * v),
      };
    };

    s.spawn({
      kind: 'card',
      card: o.card,
      dur: carryEnd,
      trail: 3,
      tint: o.tint,
      pose: (t) => hauled(t),
      done: () => o.land(lastDest ?? s.at(src)),
    });

    const fwdNow = (t: number): Pt => {
      if (!frozen) {
        const c = cardAt();
        dir = norm({ x: c.x - mid(s.at(from)).x, y: c.y - mid(s.at(from)).y });
      }
      if (t >= gripEnd) frozen = true;
      return dir;
    };
    let exitFrom: { p: Pt; fwd: Pt } | null = null;

    s.spawn({
      kind: 'glove',
      tint: o.tint,
      delay: gStart,
      dur: carryEnd + EXIT - gStart,
      pose: (tg) => {
        const t = tg + gStart;
        const fwd0 = fwdNow(t);
        const c = cardAt();
        if (t < reached) {
          const u = ease.out(clamp01((t - gStart) / REACH));
          const start = mid(s.at(from));
          const end = { x: c.x - fwd0.x * OFF, y: c.y - fwd0.y * OFF };
          return { x: lerp(start.x, end.x, u), y: lerp(start.y, end.y, u), rot: pointing(fwd0), s: 0.95, a: clamp01(u * 5), pinch: 0 };
        }
        if (t < gripEnd) {
          const v = clamp01((t - reached) / GRIP);
          return { x: c.x - fwd0.x * (OFF - 3 * v), y: c.y - fwd0.y * (OFF - 3 * v), rot: pointing(fwd0), s: 0.95 - 0.05 * v, pinch: held ? 1 : ease.out(v) };
        }
        const p = hauled(t);
        const d = mid(lastDest ?? s.at(src));
        const away = norm({ x: p.x - d.x, y: p.y - d.y });
        const blend = ease.smooth(clamp01((t - gripEnd) / (CARRY * 0.3)));
        const fwd = norm({ x: lerp(dir.x, away.x, blend), y: lerp(dir.y, away.y, blend) });
        const centre = { x: p.x - fwd.x * OFF, y: p.y - fwd.y * OFF };
        if (t < carryEnd) return { x: centre.x, y: centre.y, rot: pointing(fwd), s: 0.9, pinch: 1 };
        exitFrom ??= { p: centre, fwd };
        const v = clamp01((t - carryEnd) / EXIT);
        const run = ease.in(v) * 130;
        return {
          x: exitFrom.p.x - exitFrom.fwd.x * run,
          y: exitFrom.p.y - exitFrom.fwd.y * run,
          rot: pointing(exitFrom.fwd),
          s: 0.9 * (1 - 0.25 * v),
          a: 1 - v,
          pinch: 1,
        };
      },
    });
  }

  /** A hand that has hold of a card and waits, tugging. Picked up by `snatch` (held) or driven off by a block. */
  function grip(o: { src: Spot; from: Spot; tint: string; delay: number }) {
    const c0 = (): Pt => mid(s.at(o.src));
    let dir: Pt = { x: 0, y: -1 };
    let frozen = false;
    s.spawn({
      kind: 'glove',
      key: 'grip',
      tint: o.tint,
      delay: o.delay,
      dur: REACH + GRIP,
      hold: true,
      pose: (t) => {
        const c = c0();
        if (!frozen) {
          const h = mid(s.at(o.from));
          dir = norm({ x: c.x - h.x, y: c.y - h.y });
          const meta = s.grips.get('grip');
          if (meta) meta.dir = dir;
          if (t >= REACH) frozen = true;
        }
        if (t < REACH) {
          const u = ease.out(t / REACH);
          const start = mid(s.at(o.from));
          const end = { x: c.x - dir.x * OFF, y: c.y - dir.y * OFF };
          return { x: lerp(start.x, end.x, u), y: lerp(start.y, end.y, u), rot: pointing(dir), s: 0.95, a: clamp01(u * 5), pinch: 0 };
        }
        const v = clamp01((t - REACH) / GRIP);
        // Once it has hold it tugs, as if it might rip it away any moment.
        const tug = t > REACH + GRIP ? Math.sin(t * 0.045) : 0;
        return {
          x: c.x - dir.x * (OFF - 3 + tug * 3.5),
          y: c.y - dir.y * (OFF - 3 + tug * 3.5),
          rot: pointing(dir) + tug * 3,
          s: 0.9,
          pinch: ease.out(v),
        };
      },
    });
    s.grips.set('grip', { dir, src: o.src, from: o.from });
  }

  // ── scenes ──

  switch (b.kind) {
    case 'deal': {
      const deck = s.spot('[data-fly="deck"] .gl-back') ?? seatSpot(ME);
      let t0 = 0;
      if (b.played) {
        toss(b.played, cardSpot(b.played));
        t0 = 260;
        cx.hold('deal', 1800);
      }
      b.cards.forEach((c, i) => {
        s.hide(c.id);
        const delay = t0 + i * 170;
        s.later(delay, () => s.shake(el('[data-fly="deck"]'), 3, 170));
        fly({
          card: c,
          from: deck,
          to: s.target(`[data-cid="${c.id}"]`, '.tb-tray'),
          delay,
          dur: 660,
          arc: 120,
          boost: 34,
          tilt: i % 2 ? 12 : -12,
          flips: true,
          flipWin: [0.18, 0.6],
          minW: 62,
          trail: 2,
          land: arrive(c, (at) => s.burst('spark', mid(at), { size: 70 })),
        });
      });
      return;
    }

    case 'lay': {
      const mine = b.by === ME;
      // The game hands the turn to the next rival at once; stay with this one until their card has landed.
      if (!mine) cx.hold(b.by, 1050);
      if (mine && b.into === 'bank' && settle(b.card, (at) => {
        s.pop(el(`[data-peek="bank:${b.by}"]`), 1.16, 320);
        s.burst('dust', mid(at), { color: GREEN, size: 64 });
      })) return;
      if (mine && b.into === 'set' && settle(b.card, arrive(b.card, (at) => {
        s.burst('ring', mid(at), { color: GOLD, size: 90 });
        if (b.completed) {
          s.burst('spark', mid(at), { size: 200 });
          s.label('SET COMPLETE!', mid(at), { big: true });
        }
      }))) return;
      const from = throwFrom(b.by, b.card);
      const common = { card: b.card, from, dur: mine ? 380 : 620, arc: mine ? 50 : 100, boost: mine ? 12 : 26, flips: !mine, minW: 46, trail: mine ? 0 : 2 };
      if (b.into === 'bank') {
        fly({ ...common, to: bankNow(b.by), land: (at) => {
          s.pop(el(`[data-peek="bank:${b.by}"]`), 1.16, 320);
          s.burst('dust', mid(at), { color: GREEN, size: 64 });
        } });
        return;
      }
      s.hide(b.card.id);
      fly({
        ...common,
        to: cardNow(b.card, b.by, b.setId),
        land: arrive(b.card, (at) => {
          s.burst('ring', mid(at), { color: GOLD, size: 90 });
          if (b.completed) {
            s.burst('spark', mid(at), { size: 200 });
            s.label('SET COMPLETE!', mid(at), { big: true });
          }
        }),
      });
      return;
    }

    case 'loot': {
      cx.hold('table', 1800);
      const victim = b.from;
      const src = s.snap(b.card.id) ?? seatSpot(victim);
      const held = b.from === ME ? (s.grips.get('grip') ?? null) : null;
      if (held) {
        s.grips.delete('grip');
        s.take('grip');
      }
      s.hide(b.card.id);
      const victimTone = tone(b.by);
      if (!held) {
        // The action card is slapped down on the card it is about to take.
        slam(b.played, throwFrom(b.by, b.played), () => s.at(src), 280, (at) => {
          const p = mid(at);
          s.burst('spark', p, { color: b.by === ME ? GOLD : RED });
          s.shake(cam(), 7, 300);
          s.shake(el(`[data-seat="${victim}"]`), 8, 320);
          s.label(b.label, { x: p.x, y: p.y - 60 }, { tone: victimTone });
        });
      } else {
        s.label(b.label, mid(s.at(src)), { tone: 'red' });
      }
      snatch({
        card: b.card,
        src,
        from: handSpot(b.by),
        dest: cardNow(b.card, b.by, b.setId),
        tint: cx.tint(b.by),
        held,
        land: arrive(b.card, (at) => {
          s.burst('ring', mid(at), { color: GOLD, size: 130 });
          s.burst('spark', mid(at), { size: 120 });
          s.shake(cam(), 5, 260);
        }),
      });
      return;
    }

    case 'grab': {
      const src = s.snap(b.card.id) ?? seatSpot(ME);
      slam(b.played, handSpot(b.by), () => s.at(src), 300, (at) => {
        const p = mid(at);
        s.burst('spark', p, { color: RED });
        s.shake(cam(), 6, 280);
        s.label(b.label, { x: p.x, y: p.y - 70 }, { tone: 'red' });
      });
      grip({ src, from: handSpot(b.by), tint: cx.tint(b.by), delay: 220 });
      return;
    }

    case 'block': {
      // The game moves on to your draw at once; keep the camera on the card being defended until it is over
      // (or, when a rival blocks your play, on the rival).
      cx.hold(b.by === ME ? 'me' : b.by, 1500);
      const gripped = s.take('grip');
      const meta = s.grips.get('grip');
      s.grips.delete('grip');
      const src = meta?.src ?? s.snap(b.card.id) ?? seatSpot(ME);
      slam(b.played, throwFrom(b.by, b.played), () => s.at(src), 300, (at) => {
        const p = mid(at);
        s.flash('#ffffff99');
        s.burst('wave', p, { color: '#ffffff', size: 620 });
        s.burst('spark', p, { color: RED, size: 190 });
        s.shake(cam(), 12, 420);
        s.pop(el(`[data-cid="${b.card.id}"]`), 1.2, 400);
        s.label(b.label, { x: p.x, y: p.y - 80 }, { tone: 'red', big: true });
      });
      // The hand that had hold is thrown clear.
      const base: Pose = gripped?.last ?? { ...mid(s.at(src)), rot: 0, s: 0.9, pinch: 1 };
      const home = mid(s.at(handSpot(b.against)));
      s.spawn({
        kind: 'glove',
        tint: cx.tint(b.against),
        delay: 300,
        dur: 620,
        pose: (t) => {
          const u = ease.out(clamp01(t / 620));
          return {
            x: lerp(base.x, home.x, u),
            y: lerp(base.y, home.y, u) - 70 * Math.sin(Math.PI * u),
            rot: (base.rot ?? 0) + 900 * u,
            s: lerp(base.s ?? 0.9, 0.5, u),
            a: 1 - ease.in(u),
            pinch: 0,
          };
        },
      });
      return;
    }

    case 'raid': {
      cx.hold('table', 2500);
      const victim = b.from;
      // A hand that had hold of one of your cards lets go of it when the whole set is taken.
      if (victim === ME) {
        s.grips.delete('grip');
        s.take('grip');
      }
      const vSpot = seatSpot(victim);
      const cards = b.set.cards;
      const impactAt = 340;
      slam(b.played, throwFrom(b.by, b.played), seatNow(victim), impactAt, (at) => {
        const p = mid(at);
        s.flash('#ff4d3d66');
        s.burst('wave', p, { color: RED, size: 1000 });
        s.burst('spark', p, { size: 260 });
        s.shake(cam(), 14, 480);
        s.glow(el(`[data-seat="${victim}"]`), RED, 700);
        s.label(b.label, { x: p.x, y: p.y - 90 }, { tone: b.by === ME ? 'gold' : 'red', big: true });
      });
      cards.forEach((c, i) => {
        s.hide(c.id);
        const src = s.snap(c.id) ?? { ...vSpot, rect: { ...vSpot.rect, x: vSpot.rect.x + (i - cards.length / 2) * 14, w: 44, h: 62 } };
        const launch = impactAt + 140 + i * 85;
        const dur = launch + 600;
        const dest = cardNow(c, b.by, b.set.id);
        let last: Rect | null = null;
        s.spawn({
          kind: 'card',
          card: c,
          dur,
          trail: 3,
          pose: (t) => {
            const r = s.at(src);
            const p0 = mid(r);
            const w0 = Math.max(r.w, 44);
            if (t < launch) {
              // Waiting under the slam, then shuddering as the set is torn loose.
              const amp = t < impactAt ? 0.8 : 5;
              return { x: p0.x + Math.sin(t * 0.09 + i) * amp, y: p0.y + Math.cos(t * 0.11 + i * 2) * amp, w: w0, rot: Math.sin(t * 0.08 + i) * amp };
            }
            const v = clamp01((t - launch) / 600);
            const k = ease.inOut(v);
            const d = dest() ?? last ?? r;
            last = d;
            const p1 = mid(d);
            return {
              x: lerp(p0.x, p1.x, k),
              y: lerp(p0.y, p1.y, k) - 150 * Math.sin(Math.PI * k),
              w: lerp(w0, Math.max(d.w, 44), k) + 36 * Math.sin(Math.PI * v),
              rot: lerp(0, d.rot ?? 0, k) + (i - cards.length / 2) * 12 * Math.sin(Math.PI * v),
            };
          },
          done: () =>
            arrive(c, (at) => {
              const p = mid(at);
              s.burst('ring', p, { color: GOLD, size: 110 });
              if (i === cards.length - 1) {
                s.burst('spark', p, { size: 220 });
                s.shake(cam(), 9, 380);
              }
            })(last ?? s.at(src)),
        });
      });
      return;
    }

    case 'levy': {
      const mine = b.by === ME;
      const isRent = !!b.setId;
      const birthday = b.played.kind === 'action' && b.played.action === 'its_my_birthday';
      const from = throwFrom(b.by, b.played);

      if (!mine) {
        // Aimed at you (or at the one rival it names): the card lands on that seat and the bill arrives.
        const aim = b.aimed ?? ME;
        if (aim !== ME) cx.hold(aim, 1200);
        slam(b.played, from, seatNow(aim), 320, (at) => {
          const p = mid(at);
          s.burst('spark', p, { color: RED, size: 170 });
          s.shake(cam(), 8, 320);
          s.glow(el(`[data-seat="${aim}"]`), RED, 700);
          s.label(b.label, { x: p.x, y: p.y - 60 }, { tone: 'red', big: true });
        });
        return;
      }

      cx.hold('table', isRent || birthday ? 2600 : 2100);
      const target = isRent && b.setId ? setNow(ME, b.setId) : b.aimed ? seatNow(b.aimed) : seatNow(ME);
      const impactAt = 320;
      const myBank = bankNow(ME);
      const bankEl = () => el(`[data-peek="bank:${ME}"]`);
      let done = impactAt;
      slam(b.played, from, target, impactAt, (at) => {
        const p = mid(at);
        s.shake(cam(), 7, 300);
        if (isRent) {
          const colour = b.setId ? (el(`[data-peek="set:${ME}:${b.setId}"]`)?.style.getPropertyValue('--c') || GOLD) : GOLD;
          s.burst('wave', p, { color: colour, size: 1300 });
          s.burst('spark', p, { color: colour, size: 160 });
          s.glow(el(`[data-peek="set:${ME}:${b.setId}"]`), colour, 700);
        } else if (birthday) {
          s.burst('confetti', p, { size: 300 });
        } else {
          s.burst('spark', p, { size: 150 });
        }
        s.label(b.label, { x: p.x, y: p.y - 70 }, { tone: 'gold', big: true });
      });

      const centre = mid(s.at(seatSpot(ME)));
      let gained = 0;
      b.takes.forEach((tk, i) => {
        // The wave of a rent card reaches farther seats later; a birthday goes round the table.
        const reach = isRent ? Math.min(650, dist(centre, mid(s.at(seatSpot(tk.from)))) * 0.5) : i * 150;
        const hit = impactAt + 60 + reach;
        s.later(hit, () => {
          const seat = el(`[data-seat="${tk.from}"]`);
          s.shake(seat, 6, 320);
          s.glow(seat, RED, 560);
          const p = mid(s.at(seatSpot(tk.from)));
          s.label(tk.cards.length === 0 ? 'BROKE!' : `−${money(tk.cards.reduce((n, c) => n + c.value, 0))}`, { x: p.x, y: p.y - 30 }, { tone: 'red' });
        });
        const total = tk.cards.reduce((n, c) => n + c.value, 0);
        gained += total;
        if (tk.cards.length > 0) done = Math.max(done, carryCash(tk.cards, bankSpot(tk.from), myBank, hit + 140, 90, bankEl));
      });
      if (gained > 0) {
        s.later(done, () => s.label(`+${money(gained)}`, mid(s.at(bankSpot(ME))), { tone: 'green', big: true }));
      }
      return;
    }

    case 'pay': {
      cx.hold('table', 2000);
      const payee = b.to;
      const total = b.cards.reduce((n, c) => n + c.value, 0);
      b.cards.forEach((c, i) => {
        const isMoney = c.kind === 'money';
        // Yours start from the payment sheet; a rival's notes from their bank, their properties from where they stood.
        const from = s.snap(`pay:${c.id}`) ?? (b.by !== ME && isMoney ? bankSpot(b.by) : (s.snap(c.id) ?? (b.by === ME ? bottom() : seatSpot(b.by))));
        if (!isMoney) s.hide(c.id);
        fly({
          card: c,
          from,
          to: isMoney ? bankNow(payee) : cardNow(c, payee),
          delay: i * 90,
          dur: 640,
          arc: 130,
          boost: 24,
          turns: isMoney ? (i % 2 ? -1 : 1) : 0,
          tilt: isMoney ? 0 : 10,
          minW: 40,
          trail: 2,
          land: isMoney
            ? (at) => {
                s.pop(el(`[data-peek="bank:${payee}"]`), 1.16, 300);
                s.burst('dust', mid(at), { color: GOLD, size: 60 });
              }
            : arrive(c, (at) => s.burst('ring', mid(at), { color: GOLD, size: 100 })),
        });
      });
      s.later(360 + Math.max(0, b.cards.length - 1) * 90, () => {
        const seat = el(`[data-seat="${payee}"]`);
        s.shake(seat, 6, 300);
        s.glow(seat, GOLD, 560);
        const p = mid(s.at(seatSpot(payee)));
        s.label(`${b.label}`, { x: p.x, y: p.y - 40 }, { tone: payee === ME ? 'green' : 'red', big: total > 0 });
      });
      return;
    }

    case 'toss': {
      // A rival's card leaves their hand; yours leaves where you let go of it.
      toss(b.card, throwFrom(b.by, b.card));
      return;
    }
  }
}
