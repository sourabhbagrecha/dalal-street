import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, PointerEvent, ReactNode, RefObject } from 'react';
import type { Card, PropertyColor, PropertySet } from '@monopoly-deal/shared';
import { PropertyLandmark } from '../components/PropertyLandmarks';
import { theme } from '../theme';
import { CardBack, Cd, Icon } from './kit';
import { useSecondsLeft } from './live/useSecondsLeft';
import type { Seat, TableGame } from './model';
import { bankTotal, cardName, completeCount, isComplete, rentFor, seatById, setSize, stateName } from './model';

/**
 * Two ways to read a rival's cards without leaning on card art the camera has
 * shrunk to ~18px:
 *
 * - Glance: at table zoom each rival seat swaps its tiny cards for a
 *   constant-screen-size panel — a colour tile per set (code, n/size,
 *   crown when complete), their cash as a number, their hand size. Text stays
 *   ≥11px whatever the camera does, and no fact rests on colour alone. The
 *   panel is not interactive: a tap anywhere on the seat zooms the camera on it.
 * - Loupe: hold a set or a bank (any zoom) and its real cards float up big, in
 *   the half of the table your finger isn't in. Slide to read the next one,
 *   let go to put it away. In a zoomed seat a tap on its bank pins the loupe.
 */

const money = theme.formatMoney;
const vars = (o: Record<string, string | number>) => o as CSSProperties;
const colorOf = (c: PropertyColor) => theme.propertyColors[c] ?? '#888';

export const setKey = (seatId: string, setId: string) => `set:${seatId}:${setId}`;
export const bankKey = (seatId: string) => `bank:${seatId}`;
/** A card in the viewer's own hand — the only hand a peek can ever key into. */
export const handKey = (cardId: string) => `hand:${cardId}`;

/** Two–three letters that name a set without its colour: KER, GOA, TN. */
export function setCode(color: PropertyColor): string {
  const name = stateName(color);
  const words = name.split(/\s+/);
  const code = words.length > 1 ? words.map((w) => w[0]).join('') : name.slice(0, 3);
  // "Assam" would abbreviate to something that is not for a game table.
  return (code === 'Ass' ? 'ASM' : code).toUpperCase();
}

/** Dark or light text, whichever has the higher contrast on `hex` (#rrggbb). */
function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#14110e' : '#fff6e2';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ── Glance ───────────────────────────────────────────────────────────────────

/** What the glance panel says, for the seat's accessible name. */
export function seatSummary(seat: Seat): string {
  const away = seat.connected ? '' : ', disconnected';
  return `${seat.name}: ${plural(seat.sets.length, 'set')}, ${completeCount(seat.sets)} complete, bank ${money(bankTotal(seat.bank))}, ${plural(seat.handCount, 'card')} in hand${away}`;
}

// Three rows of two tiles: the tallest the panel can be and still clear the seat a row of the ring below it (SEAT in felt/layout.ts).
const GLANCE_SLOTS = 6;

/** `testId` goes on the panel, so a tap that starts a pick ("who pays?") can be found without knowing the seat's geometry. */
export function Glance({ seat, testId }: { seat: Seat; testId?: string }) {
  const done = completeCount(seat.sets);
  const cash = bankTotal(seat.bank);
  // Only while an actual grace window is running (a genuine disconnect the server is timing) — never for a seat
  // that simply never connected (e.g. every rival in /demo, which has no grace window to show).
  const graceSecs = useSecondsLeft(seat.connected ? undefined : seat.graceMs);
  // Three rows of two tiles; past that the last slot becomes "+N".
  const shown = seat.sets.slice(0, seat.sets.length > GLANCE_SLOTS ? GLANCE_SLOTS - 1 : GLANCE_SLOTS);
  const more = seat.sets.length - shown.length;
  return (
    <div className="tb-glance" aria-hidden data-testid={testId}>
      <div className="tb-glance__head">
        <b className="tb-glance__name">{seat.name}</b>
        {done >= 2 ? (
          <span className="tb-glance__win">1 TO WIN</span>
        ) : (
          <span className="tb-glance__pips" aria-hidden>
            {[0, 1, 2].map((i) => (
              <Icon key={i} name="star" className={i < done ? 'on' : ''} />
            ))}
          </span>
        )}
      </div>

      {/* Short form: the 148px panel has no room for "to reconnect" — the near view (RivalNear) spells it out. */}
      {graceSecs !== null && <div className="tb-glance__grace">Disconnected · {graceSecs}s</div>}

      <div className="tb-glance__sets">
        {seat.sets.length === 0 && <em>nothing laid yet</em>}
        {shown.map((s) => {
          const c = colorOf(s.color);
          const size = setSize(s.color);
          const full = isComplete(s);
          return (
            <div
              key={s.id}
              className="tb-tok"
              data-peek={setKey(seat.id, s.id)}
              data-complete={full}
              style={vars({ '--c': c, '--tok-ink': inkOn(c) })}
            >
              <b>
                {/* The same landmark glyph the card face itself wears (see PropertyLandmarks.tsx), so a set still
                    reads as its own colour without leaning on the tile's hue alone. */}
                <PropertyLandmark color={s.color} className="tb-tok__glyph" />
                {setCode(s.color)}
              </b>
              {full ? (
                <Icon name="crown" />
              ) : (
                <i>
                  {s.cards.length}/{size}
                </i>
              )}
              {(s.house || s.hotel) && <Icon name={s.hotel ? 'hotel' : 'house'} className="tb-tok__bld" />}
            </div>
          );
        })}
        {more > 0 && <span className="tb-tok tb-tok--more">+{more}</span>}
      </div>

      <div className="tb-glance__foot">
        <span className="tb-glance__hand" data-hand={seat.id} aria-hidden>
          <CardBack w={11} />
          <b>{seat.handCount}</b>
        </span>
        <span className="tb-glance__cash" data-peek={bankKey(seat.id)} data-empty={cash === 0 || undefined}>
          <b>{cash === 0 ? 'empty' : money(cash)}</b>
        </span>
      </div>
    </div>
  );
}

// ── Loupe gesture ────────────────────────────────────────────────────────────

interface Peek {
  key: string;
  /** Which half of the table the loupe sits in — always the one the finger is not. */
  at: 'top' | 'bottom';
  pinned: boolean;
}

interface Press {
  pid: number;
  x: number;
  y: number;
  key: string;
  live: boolean;
  timer: number;
}

/** How long a hold takes to open a peek — also the timing a hand card's own long-press-to-inspect matches (see useCardDrag). */
export const HOLD_MS = 220;
const SLOP = 10;

const sideOf = (el: HTMLElement, y: number): Peek['at'] => {
  const r = el.getBoundingClientRect();
  return y < r.top + r.height / 2 ? 'bottom' : 'top';
};

const keyAt = (x: number, y: number): string | null => {
  for (const el of document.elementsFromPoint(x, y)) {
    const hit = (el as HTMLElement).closest<HTMLElement>('[data-peek]');
    if (hit) return hit.dataset.peek ?? null;
  }
  return null;
};

/**
 * Hold anything carrying `data-peek` to open the loupe on it, slide to another
 * to read that instead, release to close. `pin` opens it and keeps it open until
 * the next tap. Put `bind` on the element that contains the table.
 */
export function usePeek(camRef: RefObject<HTMLElement | null>) {
  const [peek, setPeek] = useState<Peek | null>(null);
  const now = useRef(peek);
  now.current = peek;
  const press = useRef<Press | null>(null);
  const swallowUntil = useRef(0);

  const cancel = useCallback(() => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }, []);
  const close = useCallback(() => setPeek(null), []);
  const place = useCallback(
    (key: string, y: number, pinned: boolean) => {
      const cam = camRef.current;
      setPeek({ key, at: cam ? sideOf(cam, y) : 'bottom', pinned });
    },
    [camRef],
  );
  /** Pin the loupe on `key` (the cash bundle's tap). */
  const pin = useCallback((key: string, y: number) => place(key, y, true), [place]);
  /**
   * Open the loupe on `key`, unpinned, for a caller that runs its own hold timer instead of `bind`'s
   * (a hand card already has a tap/drag gesture on it — see useCardDrag's `onHold`). Release closes it
   * the same way letting go of `bind`'s own hold does.
   */
  const open = useCallback((key: string, y: number) => place(key, y, false), [place]);

  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (!peek) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPeek(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [peek]);

  const bind = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('.tb-loupe')) return;
      if (now.current?.pinned) setPeek(null);
      cancel();
      // A tile that is itself the answer to a prompt (a rent colour, a set to steal) must answer every tap: a slow one
      // would otherwise open the loupe and have its click swallowed.
      if (target.closest('[data-pick]')) return;
      const hit = target.closest<HTMLElement>('[data-peek]');
      if (!hit?.dataset.peek) return;
      const cam = e.currentTarget;
      const p: Press = { pid: e.pointerId, x: e.clientX, y: e.clientY, key: hit.dataset.peek, live: false, timer: 0 };
      p.timer = window.setTimeout(() => {
        p.live = true;
        try {
          cam.setPointerCapture(p.pid);
        } catch {
          /* the pointer is already gone */
        }
        setPeek({ key: p.key, at: sideOf(cam, p.y), pinned: false });
      }, HOLD_MS);
      press.current = p;
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const p = press.current;
      if (!p || p.pid !== e.pointerId) return;
      if (!p.live) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP) cancel();
        return;
      }
      const key = keyAt(e.clientX, e.clientY);
      const at = sideOf(e.currentTarget, e.clientY);
      setPeek((cur) => (!cur || cur.pinned || (cur.at === at && (!key || key === cur.key)) ? cur : { ...cur, at, key: key ?? cur.key }));
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const p = press.current;
      if (!p || p.pid !== e.pointerId) return;
      cancel();
      // Whatever the finger just did, the click that follows must not also zoom the camera.
      if (!p.live) return;
      swallowUntil.current = performance.now() + 350;
      setPeek(null);
    },
    onPointerCancel: () => {
      if (press.current?.live) setPeek(null);
      cancel();
    },
    onClickCapture: (e: MouseEvent<HTMLElement>) => {
      if (performance.now() < swallowUntil.current) e.stopPropagation();
    },
    // A long press must not raise the browser's own menu over the loupe.
    onContextMenu: (e: MouseEvent<HTMLElement>) => {
      if ((e.target as HTMLElement).closest('[data-peek]')) e.preventDefault();
    },
  };

  return { peek, bind, close, pin, open };
}

// ── Loupe ────────────────────────────────────────────────────────────────────

/** Card width so `n` cards share `avail` px in one row. */
const fit = (avail: number, n: number, max = 108) => Math.max(58, Math.min(max, Math.floor((avail - (n - 1) * 8) / Math.max(1, n))));

/** Bank notes collapse to one card per denomination with a count; banked actions stay single. */
function groupBank(cards: Card[]): { card: Card; count: number }[] {
  const groups = new Map<string, { card: Card; count: number }>();
  for (const c of cards) {
    const k = c.kind === 'money' ? `m${c.value}` : c.id;
    const g = groups.get(k);
    if (g) g.count += 1;
    else groups.set(k, { card: c, count: 1 });
  }
  return [...groups.values()].sort((a, b) => b.card.value - a.card.value);
}

interface Chip {
  text: string;
  tone?: 'gold' | 'warn';
}

/** What a set means to the viewer: is it safe, is it stealable, what would it charge. */
function setChips(set: PropertySet, mine: boolean): Chip[] {
  const n = set.cards.length;
  const size = setSize(set.color);
  const chips: Chip[] = [
    isComplete(set)
      ? { text: mine ? 'Complete' : 'Complete · Deal Breaker only', tone: 'gold' }
      : mine
        ? { text: `${size - n} more to finish` }
        : { text: 'Stealable', tone: 'warn' },
    { text: `Rent ${money(rentFor(set))}` },
  ];
  if (set.house || set.hotel) chips.push({ text: set.hotel ? 'Hotel' : 'House' });
  return chips;
}

export function Loupe({ g, peek, width, onClose }: { g: TableGame; peek: Peek; width: number; onClose(): void }) {
  const [kind, seatId, setId] = peek.key.split(':');
  const avail = width - 16 - 28;

  // A hand card has no seat to look up — it is always the viewer's own, held rather than laid down.
  if (kind === 'hand') {
    const card = g.hand.find((c) => c.id === seatId);
    if (!card) return null;
    return (
      <aside
        className="tb-loupe"
        data-at={peek.at}
        data-pinned={peek.pinned}
        style={vars({ '--seat': g.me.color, '--seat-ink': g.me.ink })}
        role={peek.pinned ? 'dialog' : undefined}
        aria-label={cardName(card)}
        onClick={peek.pinned ? onClose : undefined}
      >
        <header className="tb-loupe__head">
          <span className="tb-loupe__dot" aria-hidden />
          <span className="tb-loupe__title">
            <b>{cardName(card)}</b>
            <small>Your hand</small>
          </span>
          {peek.pinned && (
            <span className="tb-loupe__x" aria-label="Close">
              <Icon name="x" />
            </span>
          )}
        </header>
        <div className="tb-loupe__cards">
          <span className="tb-loupe__c">
            <Cd card={card} w={Math.min(avail, 220)} />
          </span>
        </div>
      </aside>
    );
  }

  const seat = seatById(g, seatId ?? '');
  if (!seat) return null;
  const mine = seat.id === g.me.id;
  const owner = mine ? 'Your' : `${seat.name}’s`;

  let title = '';
  let sub = '';
  let chips: Chip[] = [];
  let body: ReactNode = null;

  if (kind === 'set') {
    const set = seat.sets.find((s) => s.id === setId);
    if (!set) return null;
    const n = set.cards.length;
    const w = fit(avail, n);
    title = stateName(set.color);
    sub = `${owner} set · ${n} of ${setSize(set.color)}`;
    chips = setChips(set, mine);
    body = set.cards.map((c) => (
      <span key={c.id} className="tb-loupe__c">
        <Cd card={c} w={w} rentCount={n} />
      </span>
    ));
  } else {
    const groups = groupBank(seat.bank);
    const w = fit(avail, groups.length, 84);
    title = 'Bank';
    sub = `${owner} bank · ${money(bankTotal(seat.bank))} in ${plural(seat.bank.length, 'card')}`;
    body =
      groups.length === 0 ? (
        <em className="tb-loupe__none">nothing banked</em>
      ) : (
        groups.map(({ card, count }) => (
          <span key={card.id} className="tb-loupe__c">
            <Cd card={card} w={w} />
            {count > 1 && <b>×{count}</b>}
          </span>
        ))
      );
  }

  return (
    <aside
      className="tb-loupe"
      data-at={peek.at}
      data-pinned={peek.pinned}
      style={vars({ '--seat': seat.color, '--seat-ink': seat.ink })}
      role={peek.pinned ? 'dialog' : undefined}
      aria-label={`${title}. ${sub}`}
      onClick={peek.pinned ? onClose : undefined}
    >
      <header className="tb-loupe__head">
        <span className="tb-loupe__dot" aria-hidden />
        <span className="tb-loupe__title">
          <b>{title}</b>
          <small>{sub}</small>
        </span>
        {peek.pinned && (
          <span className="tb-loupe__x" aria-label="Close">
            <Icon name="x" />
          </span>
        )}
      </header>
      <div className="tb-loupe__cards">{body}</div>
      {chips.length > 0 && (
        <footer className="tb-loupe__chips">
          {chips.map((c) => (
            <i key={c.text} data-tone={c.tone}>
              {c.text}
            </i>
          ))}
        </footer>
      )}
    </aside>
  );
}
