import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import type { Card, PropertyColor, PropertySet } from '@monopoly-deal/shared';
import { CashPile } from '../../../components/CashPile';
import { initialsFromName } from '../../../components/PlayerAvatar';
import { theme } from '../../../theme';
import { CardBack, Cd, Icon, Ring, SetStack, Victory, clock, useBox, useFx } from '../kit';
import { handLayout } from '../handLayout';
import type { MockGame, Seat } from '../mockGame';
import {
  bankTotal,
  buildColors,
  cardName,
  completeCount,
  isComplete,
  payAssets,
  paySum,
  setSize,
  stateName,
  targetLabel,
  zonesFor,
} from '../mockGame';
import { StageLayer, useStage } from '../stage/StageLayer';
import { perform } from '../stage/choreo';
import { DragGhost, useCardDrag } from '../useCardDrag';
import { Glance, Loupe, bankKey, seatSummary, setCode, setKey, usePeek } from './tableGlance';
import '../../../styles/gl-table.css';
import '../../../styles/gl-stage.css';

/**
 * Concept 4 — The Table. The whole game is one felt table you look at through a
 * camera. Rivals sit around it with their hands fanned face-down, sets laid out
 * in front of them and their money as chip stacks, so wealth and threat read at
 * a glance. Tap any seat and the camera swoops in until their cards are big
 * enough to read; the camera also follows the game by itself (deck when you
 * draw, the rival who is acting, you when you are on the hook). You do not aim
 * a card at a zone — you throw it on the table and the game does the obvious
 * thing, telling you what before you let go.
 *
 * Reading rivals: far seats show a glance panel, hold anything for the Loupe
 * (see tableGlance.tsx), tap a seat and the camera zooms in while the seat grows
 * into the same laid-out panel you get for yourself.
 */

const money = theme.formatMoney;
const vars = (o: Record<string, string | number>) => o as CSSProperties;
const colorOf = (c: PropertyColor) => theme.propertyColors[c] ?? '#888';

// World units are "zoomed-in" pixels; the camera scales the world down to fit.
const WORLD = { w: 1160, h: 1240 };
const ZONES: Record<string, { x: number; y: number; w: number; h: number }> = {
  priya: { x: 20, y: 420, w: 350, h: 368 },
  marcus: { x: 150, y: 50, w: 350, h: 368 },
  yuki: { x: 660, y: 50, w: 350, h: 368 },
  alex: { x: 790, y: 420, w: 350, h: 368 },
  you: { x: 270, y: 800, w: 620, h: 430 },
};
const CENTRE = { x: 420, y: 510, w: 320, h: 230 };

/** 'deal' frames the deck and your seat together, for cards travelling between them. */
type Cam = 'table' | 'me' | 'centre' | 'deal' | string;

/** What the fx stamp used to say about these; the stage acts them out on the table instead. */
const STAGED_FX = new Set(['steal', 'stolen', 'collect', 'jsn', 'pay']);

/** Horizontal offset between overlapping cards in a set, as a share of card width. */
const stepFor = (w: number) => Math.round(w * 0.34);

// A seat that has the camera lays its sets and its bank out as one wrapping row of
// tiles, so the card width is whatever the biggest is that still fits the seat's body.
// The numbers mirror .tb-set / .tb-set__lab / .tb-mine__sets in gl-table.css.
const MINE_CARD_W = { min: 56, max: 116 };
const MINE_GAP = { x: 20, y: 16 };
/** Tile chrome under the cards: padding, gap and a two-line label. */
const TILE_CHROME_H = 63;
/** The label wraps at spaces, so a tile is never narrower than its longest word. */
const TILE_LABEL_MIN_W = 88;
/** The bank stack tilts, so it keeps a few px clear either side (.tb-bank .cash-pile). */
const BANK_TILT_ROOM = 12;

/**
 * The biggest card width at which every set and the bank fit `box` as wrapping tiles, and the height that
 * layout takes. `spread` sets are dealt out card by card (Sly Deal picks), so they run wider than the usual overlap.
 */
function fitSeatCard(sets: PropertySet[], box: { w: number; h: number }, spread: (s: PropertySet) => boolean = () => false): { w: number; h: number } {
  for (let w = MINE_CARD_W.max; w > MINE_CARD_W.min; w -= 2) {
    const h = flowHeight(sets, w, box.w, spread);
    if (h <= box.h) return { w, h };
  }
  return { w: MINE_CARD_W.min, h: flowHeight(sets, MINE_CARD_W.min, box.w, spread) };
}

/** Rows the sets and the bank wrap into as tiles of card width `w` in a box `boxW` wide. */
function flowRows(sets: PropertySet[], w: number, boxW: number, spread: (s: PropertySet) => boolean = () => false): number {
  const tileW = (cardsW: number) => Math.max(cardsW, TILE_LABEL_MIN_W) + 4;
  const tiles = [...sets.map((s) => tileW(w + (s.cards.length - 1) * (spread(s) ? w + 8 : stepFor(w)))), tileW(w + BANK_TILT_ROOM)];
  let rows = 1;
  let x = 0;
  for (const t of tiles) {
    if (x > 0 && x + t > boxW) {
      rows++;
      x = 0;
    }
    x += t + MINE_GAP.x;
  }
  return rows;
}

/** The height the sets and the bank take as wrapping tiles of card width `w` in a box `boxW` wide. */
function flowHeight(sets: PropertySet[], w: number, boxW: number, spread: (s: PropertySet) => boolean = () => false, chrome = TILE_CHROME_H): number {
  const rows = flowRows(sets, w, boxW, spread);
  return rows * ((w * 7) / 5 + chrome) + (rows - 1) * MINE_GAP.y;
}

type Rect = { x: number; y: number; w: number; h: number };

/** A rival you zoom on grows into a panel between these widths (world px), the same width as yours at most. */
const FOCUS_W = { min: 420, max: ZONES.you!.w, step: 20 };
/** What a rival's panel spends outside its tiles: border + padding across, border + padding + header + gap down (.tb-zone__near), plus a little slack. */
const PANEL_CHROME = { w: 56, h: 134 };
/** Screen px the seat view keeps clear: the target banner above, the rival switcher below. */
const BANNER_H = 68;
const SWITCH_H = 64;
/** The camera never zooms a rival in past the scale it uses on you, so their cards read as big as yours, not bigger. */
const SEAT_PAD = 0.97;
const seatScale = (vpW: number) => (vpW * SEAT_PAD) / ZONES.you!.w;

/**
 * Where a rival's seat sits while it has the camera, and the card width inside it: centred on its usual spot and
 * only as big as its tiles need — the biggest cards that fit a panel of yours' size, in the fewest rows, at the
 * narrowest width that still holds them.
 */
function focusLayout(seat: Seat, avail: { w: number; h: number }, spread: (s: PropertySet) => boolean): { rect: Rect; cardW: number } {
  const maxH = Math.min(WORLD.h - 100, Math.floor((avail.h * 0.94) / seatScale(avail.w)));
  let best: { w: number; fit: { w: number; h: number } } | undefined;
  for (let w = FOCUS_W.min; w <= FOCUS_W.max; w += FOCUS_W.step) {
    const fit = fitSeatCard(seat.sets, { w: w - PANEL_CHROME.w, h: maxH - PANEL_CHROME.h }, spread);
    if (!best || fit.w > best.fit.w || (fit.w === best.fit.w && fit.h < best.fit.h)) best = { w, fit };
  }
  const { w, fit } = best!;
  const h = Math.min(maxH, fit.h + PANEL_CHROME.h);
  const z = ZONES[seat.id]!;
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  return { rect: { x: clamp(z.x + z.w / 2 - w / 2, WORLD.w - w), y: clamp(z.y + z.h / 2 - h / 2, WORLD.h - h), w, h }, cardW: fit.w };
}

/** What your own seat spends outside its tiles: border + padding across, border + padding + header + gap down (.tb-mine). */
const MINE_CHROME = { w: 56, h: 118 };

/**
 * Your seat with the camera on it: cards keep one width (the biggest a rival's panel uses) however many sets pile up.
 * The panel keeps its top edge and grows downward, past the felt onto the rail, to hold the extra rows, so it never covers
 * the deck, the discard pile or a rival; it only scrolls once it has the whole screen.
 */
function mineLayout(sets: PropertySet[], avail: { w: number; h: number }): { rect: Rect; scroll: boolean } {
  const z = ZONES.you!;
  const need = flowHeight(sets, MINE_CARD_W.max, z.w - MINE_CHROME.w) + MINE_CHROME.h;
  const maxH = Math.floor((avail.h * 0.94) / seatScale(avail.w));
  const h = Math.max(z.h, Math.min(need, maxH));
  return { rect: { x: z.x, y: z.y, w: z.w, h }, scroll: need > h };
}

/** Away from the camera your seat may spread its tiles over this many rows, growing down to hold the second. */
const FAR_MINE_ROWS = 2;

/**
 * What a tile spends under its cards at table zoom, where the labels are counter-scaled to stay readable at camera scale `s`
 * (.tb-mine:not([data-focus]) .tb-set__lab): tile padding and gap, then a name line and a count line, each `10 / s` world px,
 * so the label grows as the camera pulls back. The bank's "N cards" is the longest count; it takes a second line when it
 * is wider than its tile (~0.7em a character).
 */
function farTileChrome(s: number, bankCount: number, bankTileW: number): number {
  const font = 10 / s;
  const count = bankCount === 0 ? 'empty' : `${bankCount} card${bankCount === 1 ? '' : 's'}`;
  const lines = 1 + (count.length * 0.7 * font > bankTileW ? 2 : 1);
  return 11 + lines * 1.05 * font + 2 / s;
}

/**
 * Your seat at table zoom: the biggest cards whose tiles wrap into at most FAR_MINE_ROWS rows of the usual zone's width,
 * and the panel that holds them. It keeps its top edge and grows downward, so it never crowds the rivals or the centre.
 * The labels' height depends on the camera scale, which depends on the panel's height, so the panel settles in a few passes.
 */
function farMineLayout(sets: PropertySet[], bankCount: number, vp: { w: number; h: number }): { rect: Rect; cardW: number } {
  const z = ZONES.you!;
  const boxW = z.w - MINE_CHROME.w;
  let w = MINE_CARD_W.max;
  while (w > MINE_CARD_W.min && flowRows(sets, w, boxW) > FAR_MINE_ROWS) w -= 2;
  const world: Rect = { x: 0, y: 0, ...WORLD };
  const at = (s: number) => {
    const chrome = farTileChrome(s, bankCount, Math.max(w + BANK_TILT_ROOM, TILE_LABEL_MIN_W) + 4);
    return { rect: { ...z, h: Math.max(z.h, Math.ceil(flowHeight(sets, w, boxW, undefined, chrome)) + MINE_CHROME.h) }, cardW: w };
  };
  let s = Math.min(vp.w / world.w, vp.h / world.h);
  let layout = at(s);
  for (let pass = 0; pass < 3; pass++) {
    const span = spanning(world, layout.rect);
    const next = Math.min(vp.w / span.w, vp.h / span.h);
    if (next >= s) break;
    s = next;
    layout = at(s);
  }
  return layout;
}

/** The smallest rect holding both. */
function spanning(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function camera(cam: Cam, vp: { w: number; h: number }, table: Rect, seat?: Rect, inset = { top: 0, bottom: 0 }) {
  const rect: Rect = seat ?? (cam === 'table' ? table : cam === 'centre' ? CENTRE : ZONES.you!);
  const pad = cam === 'table' ? 1 : cam === 'me' ? SEAT_PAD : 0.94;
  const availH = vp.h - inset.top - inset.bottom;
  const s = Math.min((vp.w * pad) / rect.w, (availH * pad) / rect.h, seat ? seatScale(vp.w) : Infinity);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return { s, tx: vp.w / 2 - s * cx, ty: inset.top + availH / 2 - s * cy };
}

function HandBacks({ n, id }: { n: number; id: string }) {
  const shown = Math.min(n, 7);
  return (
    <span className="tb-backs" data-hand={id} aria-label={`${n} cards in hand`}>
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} style={vars({ '--o': i - (shown - 1) / 2 })}>
          <CardBack w={34} />
        </span>
      ))}
      <b>{n}</b>
    </span>
  );
}

function Pips({ sets, big }: { sets: PropertySet[]; big?: boolean }) {
  const d = completeCount(sets);
  return (
    <span className="tb-pips" data-big={big}>
      {[0, 1, 2].map((i) => (
        <Icon key={i} name="star" className={i < d ? 'on' : ''} />
      ))}
    </span>
  );
}

interface TbSetProps {
  set: PropertySet;
  w: number;
  spread?: boolean;
  zone?: boolean;
  hot?: boolean;
  dim?: boolean;
  mark?: (c: Card) => 'pick' | 'dim' | 'hit' | undefined;
  onCard?: (c: Card) => void;
  /** Hold-to-magnify key (see usePeek). */
  peek?: string;
}
function TbSet({ set, w, spread, zone, hot, dim, mark, onCard, peek }: TbSetProps) {
  const n = set.cards.length;
  return (
    <div
      className="tb-set"
      style={vars({ '--c': colorOf(set.color) })}
      data-complete={isComplete(set)}
      data-hot={hot}
      data-dim={dim}
      data-zone={zone ? 'build' : undefined}
      data-color={zone ? set.color : undefined}
      data-peek={peek}
    >
      <SetStack set={set} w={w} step={spread ? w + 8 : stepFor(w)} mark={mark} onCard={onCard} />
      <span className="tb-set__lab">
        <b>
          <span className="tb-set__full">{stateName(set.color)}</span>
          <span className="tb-set__code">{setCode(set.color)}</span>
        </b>
        <i>
          {isComplete(set) && <Icon name="crown" className="tb-set__lab-crown" />}
          {n}/{setSize(set.color)}
        </i>
      </span>
      {isComplete(set) && (
        <span className="tb-set__crown">
          <Icon name="crown" />
        </span>
      )}
    </div>
  );
}

/** What an aimed action may take from a set. */
const isPickable = (aim: RivalNearProps['aim'], s: PropertySet) => (aim === 'sly_deal' ? !isComplete(s) : aim === 'deal_breaker' ? isComplete(s) : false);

interface BankTileProps {
  cards: Card[];
  w: number;
  seatId: string;
  /** "Your" / "Marcus’s" — for the pile's accessible name. */
  owner: string;
  hot?: boolean;
  dim?: boolean;
  /** Makes it a drop target for dragged cards. */
  drop?: boolean;
  testId?: string;
  onOpen(e: MouseEvent<HTMLButtonElement>): void;
}
/** The bank is one more tile in a seat's row — same footprint and label as a set. */
function BankTile({ cards, w, seatId, owner, hot, dim, drop, testId, onOpen }: BankTileProps) {
  return (
    <div
      className="tb-set tb-bank"
      style={vars({ '--c': 'var(--money-green, #2e9d5c)', '--card-w': `${w}px` })}
      data-zone={drop ? 'bank' : undefined}
      data-peek={bankKey(seatId)}
      data-hot={hot}
      data-dim={dim}
      onClick={(e) => e.stopPropagation()}
    >
      {cards.length === 0 ? (
        <span className="tb-bank__ghost" style={{ width: w, height: (w * 7) / 5 }} aria-label={`${owner} bank, empty`}>
          {drop ? '+' : ''}
        </span>
      ) : (
        <CashPile cards={cards} ariaLabel={`${owner} bank`} testId={testId} onOpen={onOpen} />
      )}
      <span className="tb-set__lab">
        <b>Bank</b>
        <i>{cards.length === 0 ? 'empty' : `${cards.length} card${cards.length === 1 ? '' : 's'}`}</i>
      </span>
    </div>
  );
}

interface RivalNearProps {
  seat: Seat;
  /** Final size of the panel, world px — fixed so the tiles do not reflow while the seat is still growing into it. */
  size: { w: number; h: number };
  /** Card width the panel's layout was fitted for (see focusLayout). */
  cardW: number;
  /** The action aimed at this seat while it has the camera. */
  aim?: 'sly_deal' | 'deal_breaker' | 'debt_collector';
  onTarget: MockGame['actions']['target'];
  onOpenBank(e: MouseEvent<HTMLButtonElement>): void;
}
/** A rival's seat with the camera on it: the same laid-out sets and bank tile as yours, in their colours. */
function RivalNear({ seat, size, cardW: w, aim, onTarget, onOpenBank }: RivalNearProps) {
  const picking = aim === 'sly_deal' || aim === 'deal_breaker';
  return (
    <div className="tb-zone__near" style={{ width: size.w - 12, height: size.h - 12 }}>
      <header className="tb-zone__head">
        <span className="tb-av">{initialsFromName(seat.name)}</span>
        <span className="tb-zone__name">
          <b>{seat.name}</b>
          <Pips sets={seat.sets} />
        </span>
        <HandBacks n={seat.handCount} id={seat.id} />
      </header>
      <div className="tb-zone__body">
        <div className="tb-zone__sets">
          {seat.sets.length === 0 && <span className="tb-empty">nothing laid yet</span>}
          {seat.sets.map((s) => {
            const ok = isPickable(aim, s);
            return (
              <TbSet
                key={s.id}
                set={s}
                w={w}
                peek={setKey(seat.id, s.id)}
                spread={aim === 'sly_deal' && ok}
                dim={picking && !ok}
                mark={picking ? () => (ok ? 'pick' : 'dim') : undefined}
                onCard={
                  picking && ok
                    ? (c) => (aim === 'deal_breaker' ? onTarget({ rivalId: seat.id, setId: s.id }) : onTarget({ rivalId: seat.id, cardId: c.id }))
                    : undefined
                }
              />
            );
          })}
          <BankTile
            cards={seat.bank}
            w={w}
            seatId={seat.id}
            owner={`${seat.name}’s`}
            hot={aim === 'debt_collector'}
            testId={`bank-drop-${seat.id}`}
            onOpen={onOpenBank}
          />
        </div>
      </div>
    </div>
  );
}

export function Table({ g }: { g: MockGame }) {
  const p = g.prompt;
  const fx = useFx(g);
  const [camRef, vp] = useBox<HTMLDivElement>({ w: 393, h: 470 });
  const [tableRef, table] = useBox<HTMLDivElement>({ w: 393, h: 852 });
  const [trayRef, tray] = useBox<HTMLDivElement>();
  const [manual, setManual] = useState<Cam | null>(null);
  const stage = useStage(tableRef);
  // A scene on the stage may take the camera for a moment, then hands it back to the game.
  const [stageCam, setStageCam] = useState<Cam | null>(null);
  const stageCamTimer = useRef(0);
  const holdCam = useCallback((to: Cam, ms: number) => {
    window.clearTimeout(stageCamTimer.current);
    setStageCam(to);
    stageCamTimer.current = window.setTimeout(() => setStageCam(null), ms);
  }, []);
  useEffect(() => () => window.clearTimeout(stageCamTimer.current), []);
  /** Where the finger let go of the last dragged card, so its flight starts from there. */
  const letGo = useRef<{ id: string; x: number; y: number; at: number } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [wildAsk, setWildAsk] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const { peek, bind: peekBind, close: closePeek, pin: pinPeek } = usePeek(camRef);
  const targeting = p?.kind === 'target' ? p : null;
  const targetCard = targeting ? g.hand.find((c) => c.id === targeting.cardId) : undefined;

  // The camera follows the game unless you pointed it somewhere; every beat of the game re-arms it.
  useEffect(() => setManual(null), [g.phase, g.turn, p?.kind, targeting?.action]);
  useEffect(() => {
    setSel(null);
    setWildAsk(null);
  }, [g.hand.length, p?.kind]);
  const auto: Cam =
    p?.kind === 'pay' || p?.kind === 'jsn' || targeting?.action === 'rent'
      ? 'me'
      : targeting
        ? 'table'
        : g.phase === 'rivals'
          ? g.turn
          : g.phase === 'draw'
            ? 'centre'
            : 'me';
  const cam: Cam = stageCam ?? manual ?? auto;
  useEffect(closePeek, [cam, closePeek]);
  // The bundle can't fan out inside a camera-scaled world, so its tap opens the loupe on the notes.
  const openBank = (seatId: string) => (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    pinPeek(bankKey(seatId), r.top + r.height / 2);
  };
  // A tap on a seat swoops the camera onto it, and the seat grows into its laid-out panel. Taps on the seat that already
  // has the camera belong to what is inside it.
  const openSeat = (id: string) => {
    if (cam === id) return;
    closePeek();
    setManual(id);
  };
  // A tap on bare table (felt, deck, discard, the margin) anywhere but your own zone zooms out to see everyone.
  // Seats, your zone, buttons and the loupe answer for themselves; a tap that only dismissed the loupe stays a dismissal.
  const peekWas = useRef(false);
  const zoomOut = (e: MouseEvent<HTMLElement>) => {
    if (cam === 'table' || peekWas.current) return;
    if ((e.target as HTMLElement).closest('button, .tb-mine, .tb-zone, .tb-loupe, .tb-banner')) return;
    setManual('table');
  };
  const zoomedOnSeat = cam !== 'table' && cam !== 'me' && cam !== 'centre' && cam !== 'deal';
  const focusSeat = zoomedOnSeat ? g.rivals.find((r) => r.id === cam) : undefined;
  // A seat with the camera fills the screen minus the banner above it (while aiming) and the switcher below.
  const inset = { top: targeting ? BANNER_H : 0, bottom: SWITCH_H };
  // The whole-table view while choosing a rival only needs to clear the banner; there is no switcher yet.
  const tableInset = targeting && cam === 'table' ? { top: BANNER_H, bottom: 0 } : undefined;
  const seatView = { w: vp.w, h: vp.h - inset.top - inset.bottom };
  const aim = focusSeat && targeting && targeting.action !== 'rent' ? targeting.action : undefined;
  const focus = focusSeat ? focusLayout(focusSeat, seatView, (s) => aim === 'sly_deal' && isPickable(aim, s)) : undefined;
  const mine = mineLayout(g.me.sets, vp);
  const far = farMineLayout(g.me.sets, g.me.bank.length, vp);

  const dropCard = (id: string, zone: string, color?: string) => {
    const card = g.hand.find((c) => c.id === id);
    if (!card) return;
    setSel(null);
    if (zone === 'bank') return g.actions.play(id, 'bank');
    if (zone === 'build') return g.actions.play(id, 'build', color as PropertyColor | undefined);
    // An action thrown on the discard pile is played, as at a real table.
    if (zone === 'play') return zonesFor(card).includes('play') ? g.actions.play(id, 'play') : undefined;
    if (zone === 'auto') {
      const [z] = zonesFor(card);
      if (z === 'build' && buildColors(card).length > 1) return setWildAsk(id);
      if (z === 'bank' && card.kind === 'action' && card.action === 'just_say_no') return g.actions.play(id, 'bank');
      // The obvious thing: money banks, properties build, actions play.
      const first = zonesFor(card).includes('play') ? 'play' : z;
      if (first) g.actions.play(id, first, first === 'build' ? buildColors(card)[0] : undefined);
    }
  };

  const { drag, bind } = useCardDrag({
    onTap: (id) => (p?.kind === 'discard' ? g.actions.discard(id) : setSel((s) => (s === id ? null : id))),
    onLift: () => {
      setSel(null);
      setManual('me');
    },
    onDrop: (id, hit) => {
      if (hit.x !== undefined && hit.y !== undefined) letGo.current = { id, x: hit.x, y: hit.y, at: performance.now() };
      if (hit.zone) dropCard(id, hit.zone, hit.color);
    },
    enabled: g.canAct || p?.kind === 'discard',
  });
  const dragCard = drag ? g.hand.find((c) => c.id === drag.cardId) : undefined;
  const selCard = sel ? g.hand.find((c) => c.id === sel) : undefined;
  const hotZones = new Set(dragCard && g.canAct ? zonesFor(dragCard) : []);
  const focusColors = dragCard ? buildColors(dragCard) : [];
  const playHot = !!dragCard && hotZones.has('play');

  // Carrying a playable card, the camera keeps the discard pile in frame along with your seat, so both drop targets are on screen.
  const cm = camera(cam, vp, spanning({ x: 0, y: 0, ...WORLD }, far.rect), focus?.rect ?? (cam === 'me' ? (playHot ? spanning(mine.rect, CENTRE) : mine.rect) : cam === 'deal' ? spanning(far.rect, CENTRE) : undefined), focus ? inset : tableInset);

  // What just happened on the table plays out on the stage; each commit then re-reads where everything stands,
  // so the next beat can find the cards this one takes away.
  const lastBeat = useRef(0);
  useLayoutEffect(() => {
    const b = g.beat;
    if (b && b.id !== lastBeat.current) {
      lastBeat.current = b.id;
      perform(b, {
        stage,
        tint: (id) => g.rivals.find((r) => r.id === id)?.color ?? theme.selfColor,
        dropped: (id) => {
          const d = letGo.current;
          const o = tableRef.current?.getBoundingClientRect();
          if (!d || d.id !== id || !o || performance.now() - d.at > 2500) return null;
          return stage.screenSpot(d.x - o.left, d.y - o.top, 90);
        },
        hold: holdCam,
      });
    }
    stage.snapshot();
  });

  // What letting go would do, in words.
  const predict = (card: Card, zone: string | null, color?: string): string | null => {
    if (!g.canAct) return null;
    if (zone === 'bank') return zonesFor(card).includes('bank') ? `Bank ${money(card.value)}` : 'Can’t bank this';
    if (zone === 'build') {
      const c = (color as PropertyColor) ?? buildColors(card)[0];
      return zonesFor(card).includes('build') && c ? `Build ${stateName(c)}` : 'Not a property';
    }
    if (zone === 'play') return zonesFor(card).includes('play') ? `Play ${cardName(card)}` : 'Can’t play this';
    if (zone === 'auto') {
      if (card.kind === 'money') return `Bank ${money(card.value)}`;
      if (card.kind === 'property') return `Build ${stateName(card.color)}`;
      if (card.kind === 'property_wild') return 'Build — pick a colour';
      if (card.kind === 'action' && card.action === 'just_say_no') return `Bank ${money(card.value)}`;
      return `Play ${cardName(card)}`;
    }
    return null;
  };
  const tag = drag && dragCard ? predict(dragCard, drag.zone, drag.color) : null;

  // ── pills over a tapped card ──
  const pills = (() => {
    if (!selCard || !g.canAct) return [];
    const out: { key: string; label: string; sub?: string; act(): void; gold?: boolean }[] = [];
    for (const z of zonesFor(selCard)) {
      if (z === 'play') out.push({ key: 'play', label: `Play ${cardName(selCard)}`, act: () => dropCard(selCard.id, 'auto'), gold: true });
      if (z === 'build')
        for (const c of buildColors(selCard)) {
          const have = g.me.sets.find((s) => s.color === c && !isComplete(s))?.cards.length ?? 0;
          const done = have + 1 >= setSize(c);
          out.push({ key: `b${c}`, label: `Build ${stateName(c)}`, sub: done ? 'completes set' : `${have + 1}/${setSize(c)}`, act: () => dropCard(selCard.id, 'build', c), gold: done });
        }
      if (z === 'bank') out.push({ key: 'bank', label: `Bank ${money(selCard.value)}`, act: () => dropCard(selCard.id, 'bank') });
    }
    return out;
  })();

  // ── the seat plates ──
  const seatZone = (r: Seat) => {
    const z = ZONES[r.id]!;
    const d = completeCount(r.sets);
    const near = cam === r.id && focus;
    const rect = near ? near.rect : z;
    return (
      <section
        key={r.id}
        className="tb-zone"
        data-seat={r.id}
        style={vars({ left: rect.x, top: rect.y, width: rect.w, height: rect.h, '--seat': r.color, '--seat-ink': r.ink })}
        data-turn={g.turn === r.id}
        data-away={!r.connected}
        data-danger={d >= 2}
        data-focus={!!near}
        data-lod={near ? 'near' : 'far'}
        onClick={() => openSeat(r.id)}
        {...(near
          ? {}
          : {
              // Far, the seat is one control: the glance panel inside is only a picture of it.
              role: 'button',
              tabIndex: 0,
              'aria-label': `${seatSummary(r)}. Zoom in`,
              onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                openSeat(r.id);
              },
            })}
      >
        <Glance seat={r} />
        {near && <RivalNear seat={r} size={rect} cardW={near.cardW} aim={aim} onTarget={g.actions.target} onOpenBank={openBank(r.id)} />}
        {near && d >= 2 && <span className="tb-zone__warn">1 SET FROM WINNING</span>}
      </section>
    );
  };

  // With the camera on it your seat is the panel above; otherwise it sits in its usual spot, its tiles fitted to that.
  const mineNear = cam === 'me';
  const mz = mineNear ? mine.rect : far.rect;
  const mineW = mineNear ? MINE_CARD_W.max : far.cardW;
  const bankHot = !!dragCard && hotZones.has('bank');
  const rentPick = targeting?.action === 'rent' && targetCard?.kind === 'rent';
  const selSum = p?.kind === 'pay' ? paySum(g, p.sel) : 0;
  const total = bankTotal(payAssets(g));
  const due = p?.kind === 'pay' ? Math.min(p.amount, total) : 0;
  const maxSecs = p?.kind === 'pay' ? 30 : p?.kind === 'jsn' ? 20 : 60;
  const actor = g.rivals.find((r) => r.id === g.turn);
  const puck = ZONES[g.turn] ?? ZONES.you!;
  const last = g.feed[g.feed.length - 1];

  // ── HUD line ──
  const hud = (() => {
    if (g.won) return 'You win!';
    if (p?.kind === 'pay') return `${g.rivals.find((r) => r.id === p.toId)?.name} wants ${money(p.amount)}`;
    if (p?.kind === 'jsn') return `${g.rivals.find((r) => r.id === p.fromId)?.name} · ${p.label}!`;
    if (targeting) return `Playing ${targetCard ? cardName(targetCard) : 'a card'}`;
    if (p?.kind === 'discard') return `Hand limit — discard ${p.excess}`;
    if (g.phase === 'draw') return 'Your turn — draw 2';
    if (g.phase === 'rivals') return `${actor?.name ?? ''} is playing`;
    return g.plays === 0 ? 'No plays left' : `Your turn · ${g.plays} play${g.plays === 1 ? '' : 's'} left`;
  })();

  const fan = handLayout(g.hand.length, tray.w, table.h);

  // ── end-turn / primary button ──
  let cta: { label: string; sub?: string; tone?: string; onClick?: () => void; disabled?: boolean } = { label: 'END', sub: 'TURN', onClick: g.actions.endTurn };
  if (p?.kind === 'pay') cta = { label: 'PAY', sub: money(selSum), tone: 'green', onClick: g.actions.payConfirm, disabled: selSum < due };
  else if (p?.kind === 'jsn') cta = { label: 'NO!', sub: 'JUST SAY', tone: 'red', onClick: g.actions.jsn, disabled: !g.hasJsn };
  else if (targeting?.action === 'debt_collector' && focusSeat) cta = { label: 'TAKE', sub: money(5), tone: 'green', onClick: () => g.actions.target({ rivalId: focusSeat.id }) };
  else if (targeting) cta = { label: 'BACK', tone: 'ghost', onClick: g.actions.cancel };
  else if (p?.kind === 'discard') cta = { label: `−${p.excess}`, disabled: true };
  else if (g.phase === 'draw') cta = { label: 'DRAW', sub: '+2', tone: 'gold', onClick: g.actions.draw };
  else if (g.phase === 'rivals') cta = { label: '···', disabled: true };
  else if (g.plays === 0) cta = { ...cta, tone: 'gold' };

  return (
    <div className="tb" ref={tableRef} data-mode={p?.kind ?? g.phase}>
      {/* ── HUD ── */}
      <header className="tb-hud">
        <Ring value={g.turn === 'you' || p ? g.secs / maxSecs : 0} size={40} stroke={4} color={g.secs <= 10 ? '#ff6b57' : '#f2c14e'} track="#ffffff22">
          <span className="tb-hud__t">{g.turn === 'you' || p ? clock(g.secs) : '—'}</span>
        </Ring>
        <span className="tb-hud__line">
          <b>{hud}</b>
          <small>
            {last?.who && `${last.who} `}
            {last?.text}
          </small>
        </span>
        <button type="button" className="tb-hud__btn" onClick={() => setShowLog(true)} aria-label="Game log">
          <Icon name="chat" />
        </button>
        <button type="button" className="tb-hud__btn" data-on={cam === 'table'} onClick={() => setManual(cam === 'table' ? 'me' : 'table')} aria-label="See the whole table" aria-pressed={cam === 'table'}>
          <Icon name="menu" />
        </button>
      </header>

      {/* ── The camera ── */}
      <main
        ref={camRef}
        className="tb-cam"
        data-cam={zoomedOnSeat ? 'seat' : cam}
        {...peekBind}
        onPointerDown={(e) => {
          peekWas.current = !!peek;
          peekBind.onPointerDown(e);
        }}
        onClick={zoomOut}
      >
        <div className="tb-world" style={vars({ width: WORLD.w, height: WORLD.h, '--s': cm.s, transform: `translate(${cm.tx}px, ${cm.ty}px) scale(${cm.s})` })}>
          <div className="tb-felt" />
          {g.rivals.map(seatZone)}

          <div className="tb-centre" style={vars({ left: CENTRE.x, top: CENTRE.y, width: CENTRE.w, height: CENTRE.h })}>
            <button type="button" className="tb-deck" data-fly="deck" data-ready={g.phase === 'draw'} onClick={g.actions.draw} aria-label={`Draw pile, ${g.deck} cards`}>
              <CardBack w={104} />
              <i>{g.deck}</i>
              {g.phase === 'draw' && <em>TAP TO DRAW 2</em>}
            </button>
            <span className="tb-discard" aria-label="Discard pile" data-zone="play" data-hot={playHot} data-fly="discard" data-cid={g.discard[g.discard.length - 1]?.id}>
              {g.discard.length > 0 && <Cd card={g.discard[g.discard.length - 1]!} w={104} />}
            </span>
          </div>

          <section
            className="tb-mine"
            data-seat={g.me.id}
            style={vars({ left: mz.x, top: mz.y, width: mz.w, height: mz.h })}
            data-zone="auto"
            data-hot={!!dragCard && g.canAct}
            data-focus={mineNear}
            data-grown={mz.h > ZONES.you!.h}
            data-scroll={mineNear && mine.scroll}
            onClick={() => cam !== 'me' && setManual('me')}
          >
            <header className="tb-mine__head">
              <span className="tb-av tb-av--me">★</span>
              <b>You</b>
              <Pips sets={g.me.sets} big />
              <span className="tb-mine__rent">rent shown under each set</span>
            </header>
            <div className="tb-mine__body">
              <div className="tb-mine__sets">
                {g.me.sets.map((s) => {
                  const ok = rentPick && targetCard.colors.includes(s.color);
                  const hot = !!dragCard && hotZones.has('build') && focusColors.includes(s.color) && !isComplete(s);
                  return (
                    <TbSet
                      key={s.id}
                      set={s}
                      w={mineW}
                      peek={setKey(g.me.id, s.id)}
                      zone
                      hot={hot}
                      dim={(!!dragCard && hotZones.has('build') && !focusColors.includes(s.color)) || (!!rentPick && !ok)}
                      mark={p?.kind === 'jsn' ? (c) => (c.id === p.card.id ? 'hit' : undefined) : rentPick ? () => (ok ? 'pick' : 'dim') : undefined}
                      onCard={rentPick && ok ? () => g.actions.target({ color: s.color }) : undefined}
                    />
                  );
                })}
                {g.me.sets.length === 0 && <span className="tb-empty">throw a property here</span>}
                <BankTile
                  cards={g.me.bank}
                  w={mineW}
                  seatId={g.me.id}
                  owner="Your"
                  drop
                  hot={bankHot}
                  dim={!!dragCard && !bankHot}
                  onOpen={openBank(g.me.id)}
                />
              </div>
            </div>
          </section>

          <span className="tb-puck" style={vars({ left: puck.x + 8, top: puck.y - 44 })} aria-hidden>
            <b>TURN</b>
          </span>
        </div>

        {/* target / prompt banners live above the camera */}
        {targeting && (
          <div className="tb-banner">
            <b>{targetLabel[targeting.action]}</b>
            <span>
              {focusSeat
                ? `${focusSeat.name}'s table · switch rival below`
                : targeting.action === 'rent'
                  ? 'your table · tap a rival to look at theirs'
                  : 'the whole table · tap the rival you want to play against'}
            </span>
          </div>
        )}
        {focusSeat && (
          <nav className="tb-seats" aria-label="Rivals">
            <button type="button" className="tb-seats__close" onClick={() => setManual('table')} aria-label="Back to the whole table">
              <Icon name="x" />
            </button>
            <div className="tb-seats__tabs">
              {g.rivals.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={r.id === focusSeat.id}
                  data-danger={completeCount(r.sets) >= 2}
                  style={vars({ '--seat': r.color })}
                  onClick={() => setManual(r.id)}
                >
                  <i aria-hidden />
                  <span>{r.name}</span>
                </button>
              ))}
            </div>
          </nav>
        )}
        {fx && !(STAGED_FX.has(fx.kind) && !stage.reduced) && (
          <div key={fx.id} className="tb-fx" data-kind={fx.kind} style={vars({ '--c': fx.color ? colorOf(fx.color) : '#f2c14e' })}>
            {fx.text}
          </div>
        )}
        {peek && (
          <Loupe
            g={g}
            peek={peek}
            width={vp.w}
            onClose={closePeek}
          />
        )}
        {tag && drag && (
          <div className="tb-tag" style={vars({ left: drag.x, top: drag.y - 108 })} data-bad={/Can’t|Not a/.test(tag)}>
            {tag}
          </div>
        )}
      </main>

      {/* ── Tray: hand, or the payment ── */}
      <footer
        className="tb-tray"
        ref={trayRef}
        data-dim={g.phase === 'rivals' && !p}
        style={fan.trayH && p?.kind !== 'pay' ? vars({ '--tray-h': `${fan.trayH}px` }) : undefined}
      >
        {pills.length > 0 && (
          <div className="tb-pills">
            {pills.map((pl) => (
              <button key={pl.key} type="button" data-gold={pl.gold} onClick={pl.act}>
                <b>{pl.label}</b>
                {pl.sub && <small>{pl.sub}</small>}
              </button>
            ))}
          </div>
        )}
        {p?.kind === 'pay' ? (
          <div className="tb-pay">
            <div className="tb-pay__cards">
              {payAssets(g).map((c) => (
                <button key={c.id} type="button" data-pay={c.id} data-on={p.sel.includes(c.id)} onClick={() => g.actions.paySel(c.id)} aria-pressed={p.sel.includes(c.id)} aria-label={cardName(c)}>
                  <Cd card={c} w={62} />
                  {p.sel.includes(c.id) && (
                    <span>
                      <Icon name="check" />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button type="button" className="tb-pay__auto" onClick={g.actions.payAuto}>
              Auto-pick
            </button>
          </div>
        ) : (
          g.hand.map((c, i) => {
            const at = fan.place(i);
            return (
              <div
                key={c.id}
                className="tb-card"
                data-cid={c.id}
                data-sel={sel === c.id}
                data-lifted={drag?.cardId === c.id}
                data-legal={g.canAct}
                data-glow={p?.kind === 'jsn' && c.kind === 'action' && c.action === 'just_say_no'}
                data-discard={p?.kind === 'discard'}
                style={vars({ '--i': i, '--x': `${at.x}px`, '--y': `${at.y}px`, '--r': `${at.r}deg`, '--hw': `${fan.w}px` })}
                {...bind(c.id)}
                aria-label={cardName(c)}
              >
                <Cd card={c} w={fan.w} />
              </div>
            );
          })
        )}
        <button type="button" className="tb-cta" data-tone={cta.tone} disabled={cta.disabled} onClick={cta.onClick}>
          <b>{cta.label}</b>
          {cta.sub && <small>{cta.sub}</small>}
        </button>
      </footer>
      <DragGhost drag={drag} card={dragCard} w={90} />

      {wildAsk && (
        <Ask onClose={() => setWildAsk(null)} title="Which set does it join?">
          {buildColors(g.hand.find((c) => c.id === wildAsk)!).map((c) => (
            <button
              key={c}
              type="button"
              style={vars({ '--c': colorOf(c) })}
              onClick={() => {
                g.actions.play(wildAsk, 'build', c);
                setWildAsk(null);
              }}
            >
              <i />
              <b>{stateName(c)}</b>
              <small>{g.me.sets.find((s) => s.color === c && !isComplete(s))?.cards.length ?? 0}/{setSize(c)} now</small>
            </button>
          ))}
        </Ask>
      )}

      {p?.kind === 'jsn' && (
        <div className="tb-alert">
          <b>{g.rivals.find((r) => r.id === p.fromId)?.name}</b> is taking your {cardName(p.card)}.
          <button type="button" onClick={g.actions.allow}>
            Let it go
          </button>
        </div>
      )}

      {showLog && (
        <div className="tb-sheet" onClick={() => setShowLog(false)}>
          <ol onClick={(e) => e.stopPropagation()}>
            {g.feed
              .slice(-9)
              .reverse()
              .map((f) => (
                <li key={f.id} data-tone={f.tone}>
                  {f.who && <b>{f.who}</b>} {f.text}
                </li>
              ))}
          </ol>
        </div>
      )}
      <Victory g={g} />
      <StageLayer stage={stage} />
    </div>
  );
}

function Ask({ children, title, onClose }: { children: ReactNode; title: string; onClose(): void }) {
  return (
    <div className="tb-ask" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>
        <b>{title}</b>
        <span>{children}</span>
      </div>
    </div>
  );
}
