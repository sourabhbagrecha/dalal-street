import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import type { Card, PropertyColor, PropertySet } from '@monopoly-deal/shared';
import { CashPile } from '../components/CashPile';
import { initialsFromName } from '../components/PlayerAvatar';
import { theme } from '../theme';
import { CardBack, Cd, Icon, Ring, SetStack, Victory, clock, useBox, useFx, useScrollMore } from './kit';
import { Confirms } from './Confirms';
import { handLayout } from './handLayout';
import type { Prompt, Seat, SentPlay, TableActions, TableGame, TargetKind } from './model';
import {
  buildColors,
  cardName,
  completeCount,
  isComplete,
  payAssets,
  paySum,
  setSize,
  stateName,
  targetLabel,
  wildColors,
  zonesFor,
} from './model';
import { ChromeOverlays } from './chrome/ChromeOverlays';
import { ChromeBoundary } from './chrome/ChromeProvider';
import { FeedButton } from './chrome/FeedButton';
import { StageLayer, useStage } from './stage/StageLayer';
import { bounce, park, parkKey, perform } from './stage/choreo';
import type { Spot } from './stage/stage';
import { DragGhost, useCardDrag } from './useCardDrag';
import { Glance, Loupe, bankKey, seatSummary, setCode, setKey, usePeek } from './tableGlance';
import '../styles/gl-kit.css';
import '../styles/gl-shell.css';
import '../styles/gl-table.css';
import '../styles/gl-stage.css';

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
type Rect = { x: number; y: number; w: number; h: number };
const ME_ZONE: Rect = { x: 270, y: 800, w: 620, h: 430 };
/** Where rivals sit, by how many there are. Rivals are listed in turn order after you, so they run round the table clockwise. */
const SEAT = { left: { x: 20, y: 420, w: 350, h: 368 }, topLeft: { x: 150, y: 50, w: 350, h: 368 }, top: { x: 405, y: 50, w: 350, h: 368 }, topRight: { x: 660, y: 50, w: 350, h: 368 }, right: { x: 790, y: 420, w: 350, h: 368 } };
const SEATING: Rect[][] = [[], [SEAT.top], [SEAT.topLeft, SEAT.topRight], [SEAT.left, SEAT.top, SEAT.right], [SEAT.left, SEAT.topLeft, SEAT.topRight, SEAT.right]];
/** Each rival's zone on the felt, by seat id. */
function seatZones(rivals: Seat[]): Record<string, Rect> {
  const slots = SEATING[Math.min(rivals.length, 4)]!;
  return Object.fromEntries(rivals.map((r, i) => [r.id, slots[i] ?? SEAT.top]));
}
const CENTRE = { x: 400, y: 455, w: 360, h: 300 };
/** Draw and discard piles share one card width (world px): the focal point of the felt, so the biggest cards on it. */
const PILE_W = 148;

/** 'deal' frames the deck and your seat together, for cards travelling between them. */
type Cam = 'table' | 'me' | 'centre' | 'deal' | string;

/** What the fx stamp used to say about these; the stage acts them out on the table instead (a finished set stamps its own SET COMPLETE!). */
const STAGED_FX = new Set(['steal', 'stolen', 'collect', 'jsn', 'pay', 'set', 'win']);

/** Horizontal offset between overlapping cards in a set, as a share of card width. */
const stepFor = (w: number) => Math.round(w * 0.34);

// A seat that has the camera lays its bank and its sets out as one wrapping row of
// tiles (bank first), so the card width is whatever the biggest is that still fits the seat's body.
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
  const tiles = [tileW(w + BANK_TILT_ROOM), ...sets.map((s) => tileW(w + (s.cards.length - 1) * (spread(s) ? w + 8 : stepFor(w))))];
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
  return rowsHeight(flowRows(sets, w, boxW, spread), w, chrome);
}

/** The height `rows` rows of tiles of card width `w` take. */
function rowsHeight(rows: number, w: number, chrome = TILE_CHROME_H): number {
  return rows * ((w * 7) / 5 + chrome) + (rows - 1) * MINE_GAP.y;
}

/** A rival you zoom on grows into a panel between these widths (world px), the same width as yours at most. */
const FOCUS_W = { min: 420, max: ME_ZONE.w, step: 20 };
/** What a rival's panel spends outside its tiles: border + padding across, border + padding + header + gap down (.tb-zone__near), plus a little slack. */
const PANEL_CHROME = { w: 56, h: 134 };
/** Screen px the seat view keeps clear: the target banner above, the rival switcher below. */
const BANNER_H = 68;
/** The Just Say No alert (a contested card, the threat, the answers) is taller than the banner. */
const JSN_H = 128;
/** The TURN puck sits over the top edge of the seat it marks; on your own seat, under a banner, it keeps this much room. */
const PUCK_ROOM = 22;
const SWITCH_H = 94;
/** The camera never zooms a rival in past the scale it uses on you, so their cards read as big as yours, not bigger. */
const SEAT_PAD = 0.97;
const seatScale = (vpW: number) => (vpW * SEAT_PAD) / ME_ZONE.w;

/**
 * Where a rival's seat sits while it has the camera, and the card width inside it: centred on its usual spot and
 * only as big as its tiles need — the biggest cards that fit a panel of yours' size, in the fewest rows, at the
 * narrowest width that still holds them.
 */
function focusLayout(seat: Seat, zone: Rect, avail: { w: number; h: number }, spread: (s: PropertySet) => boolean): { rect: Rect; cardW: number } {
  const maxH = Math.min(WORLD.h - 100, Math.floor((avail.h * 0.94) / seatScale(avail.w)));
  let best: { w: number; fit: { w: number; h: number } } | undefined;
  for (let w = FOCUS_W.min; w <= FOCUS_W.max; w += FOCUS_W.step) {
    const fit = fitSeatCard(seat.sets, { w: w - PANEL_CHROME.w, h: maxH - PANEL_CHROME.h }, spread);
    if (!best || fit.w > best.fit.w || (fit.w === best.fit.w && fit.h < best.fit.h)) best = { w, fit };
  }
  const { w, fit } = best!;
  const h = Math.min(maxH, fit.h + PANEL_CHROME.h);
  const z = zone;
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  return { rect: { x: clamp(z.x + z.w / 2 - w / 2, WORLD.w - w), y: clamp(z.y + z.h / 2 - h / 2, WORLD.h - h), w, h }, cardW: fit.w };
}

/** What your own seat spends outside its tiles: border + padding across, border + padding + header + gap down (.tb-mine). */
const MINE_CHROME = { w: 56, h: 118 };

/** Rows your seat shows at once. Fewer sets than fit are laid out whole; more, and the cards shrink to fit them, then the rest scrolls. */
const NEAR_MINE_ROWS = 2;
/** Narrowest your cards get on screen (css px) while they shrink: the app-wide card floor, so the rent figures stay readable. */
const NEAR_CARD_PX = 64;
/** The share of the view your seat may fill; the rest stays bare table above and below it, to tap and zoom out. */
const NEAR_FILL = 0.7;

/**
 * Your seat with the camera on it: cards start at the biggest width (a rival's panel uses the same) and only shrink once
 * the tiles would need more than NEAR_MINE_ROWS rows or the panel would fill more than NEAR_FILL of the view, never below
 * NEAR_CARD_PX on screen. The panel keeps its top edge and grows downward, past the felt onto the rail, so it never covers
 * the deck, the discard pile or a rival. It is never taller than NEAR_MINE_ROWS rows of tiles: what does not fit
 * even at the smallest cards scrolls inside it.
 */
function mineLayout(sets: PropertySet[], avail: { w: number; h: number }): { rect: Rect; cardW: number; scroll: boolean } {
  const z = ME_ZONE;
  const boxW = z.w - MINE_CHROME.w;
  const scale = seatScale(avail.w);
  const maxH = Math.floor((avail.h * NEAR_FILL) / scale);
  const floor = Math.min(MINE_CARD_W.max, Math.max(MINE_CARD_W.min, Math.ceil(NEAR_CARD_PX / scale / 2) * 2));
  const needAt = (w: number) => flowHeight(sets, w, boxW) + MINE_CHROME.h;
  let w = MINE_CARD_W.max;
  while (w > floor && (flowRows(sets, w, boxW) > NEAR_MINE_ROWS || needAt(w) > maxH)) w -= 2;
  const need = needAt(w);
  const h = Math.max(z.h, Math.min(need, rowsHeight(NEAR_MINE_ROWS, w) + MINE_CHROME.h, maxH));
  return { rect: { x: z.x, y: z.y, w: z.w, h }, cardW: w, scroll: need > h };
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
  const z = ME_ZONE;
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
  const rect: Rect = seat ?? (cam === 'table' ? table : cam === 'centre' ? CENTRE : ME_ZONE);
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
  mark?: (c: Card) => 'pick' | 'dim' | 'hit' | 'tap' | 'sel' | undefined;
  onCard?: (c: Card) => void;
  /** Test id for a card `mark` calls pickable. */
  cardTestId?: (c: Card) => string | undefined;
  /** Makes the whole tile one tap (a rent colour, a building's set, a Deal Breaker's set). */
  onPick?: () => void;
  /** What the tap does, in a chip on the tile ("₹4"). */
  chip?: string;
  testId?: string;
  /** Hold-to-magnify key (see usePeek). */
  peek?: string;
}
function TbSet({ set, w, spread, zone, hot, dim, mark, onCard, cardTestId, onPick, chip, testId, peek }: TbSetProps) {
  const n = set.cards.length;
  return (
    <div
      className="tb-set"
      style={vars({ '--c': colorOf(set.color) })}
      data-complete={isComplete(set)}
      data-hot={hot}
      data-dim={dim}
      data-pick={onPick ? true : undefined}
      data-zone={zone ? 'build' : undefined}
      data-color={zone ? set.color : undefined}
      data-peek={peek}
      data-testid={testId}
      {...(onPick
        ? {
            role: 'button',
            tabIndex: 0,
            onClick: (e: MouseEvent<HTMLDivElement>) => {
              e.stopPropagation();
              onPick();
            },
            onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              onPick();
            },
          }
        : {})}
    >
      {chip && <span className="tb-set__chip">{chip}</span>}
      <SetStack set={set} w={w} step={spread ? w + 8 : stepFor(w)} mark={mark} onCard={onCard} cardTestId={cardTestId} />
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

/** What is being aimed at a rival while their seat has the camera. */
type RivalAim = 'sly_deal' | 'deal_breaker' | 'debt_collector' | 'rent_player' | 'forced_deal';
/** Aims that pick a card or set on the rival's table (the others pick the rival). */
const picksCards = (aim: RivalAim | undefined) => aim === 'sly_deal' || aim === 'deal_breaker' || aim === 'forced_deal';
/** What an aimed action may take from a set. */
const isPickable = (aim: RivalAim | undefined, s: PropertySet) => (aim === 'sly_deal' || aim === 'forced_deal' ? !isComplete(s) : aim === 'deal_breaker' ? isComplete(s) : false);

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
  /** Cards put down on it that the server has not confirmed yet: parked on the stage, and counted in the label. */
  extra?: number;
  onOpen(e: MouseEvent<HTMLButtonElement>): void;
}
/** The bank is one more tile in a seat's row — same footprint and label as a set. */
function BankTile({ cards, w, seatId, owner, hot, dim, drop, testId, extra = 0, onOpen }: BankTileProps) {
  return (
    <div
      className="tb-set tb-bank"
      style={vars({ '--c': 'var(--money-green, #2e9d5c)', '--card-w': `${w}px` })}
      data-zone={drop ? 'bank' : undefined}
      data-testid={drop ? testId : undefined}
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
        <CashPile cards={cards} ariaLabel={`${owner} bank`} testId={drop ? undefined : testId} onOpen={onOpen} />
      )}
      <span className="tb-set__lab">
        <b>Bank</b>
        <i>{cards.length + extra === 0 ? 'empty' : `${cards.length + extra} card${cards.length + extra === 1 ? '' : 's'}`}</i>
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
  aim?: RivalAim;
  onTarget: TableActions['target'];
  onOpenBank(e: MouseEvent<HTMLButtonElement>): void;
}
/** A rival's seat with the camera on it: the same laid-out sets and bank tile as yours, in their colours. */
function RivalNear({ seat, size, cardW: w, aim, onTarget, onOpenBank }: RivalNearProps) {
  const picking = picksCards(aim);
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
        <div className="tb-zone__sets" data-testid="opponent-spotlight-sets">
          <BankTile
            cards={seat.bank}
            w={w}
            seatId={seat.id}
            owner={`${seat.name}’s`}
            hot={aim === 'debt_collector' || aim === 'rent_player'}
            testId={`bank-drop-${seat.id}`}
            onOpen={onOpenBank}
          />
          {seat.sets.length === 0 && <span className="tb-empty">nothing laid yet</span>}
          {seat.sets.map((s) => {
            const ok = isPickable(aim, s);
            // Deal Breaker takes a whole set, so the whole tile is the button; the other picks name one card.
            const whole = aim === 'deal_breaker' && ok;
            return (
              <TbSet
                key={s.id}
                set={s}
                w={w}
                peek={setKey(seat.id, s.id)}
                spread={(aim === 'sly_deal' || aim === 'forced_deal') && ok}
                hot={whole}
                dim={picking && !ok}
                mark={picking ? () => (ok && !whole ? 'pick' : ok ? undefined : 'dim') : undefined}
                onPick={whole ? () => onTarget({ rivalId: seat.id, setId: s.id }) : undefined}
                testId={whole ? `deal-breaker-set-${s.id}` : undefined}
                onCard={picking && ok && !whole ? (c) => onTarget({ rivalId: seat.id, cardId: c.id }) : undefined}
                cardTestId={(c) => `steal-card-${c.id}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** The old prompt each target choice replaces, kept as its test id on the banner that now asks it. */
const TARGET_TESTID: Record<TargetKind, string> = {
  sly_deal: 'steal-target-prompt',
  deal_breaker: 'deal-breaker-prompt',
  debt_collector: 'debt-collector-prompt',
  rent: 'rent-color-prompt',
  rent_player: 'rent-player-prompt',
  forced_deal: 'forced-deal-prompt',
  building: 'building-prompt',
};
type TargetPrompt = Extract<Prompt, { kind: 'target' }>;

/** What the banner asks. */
function targetTitle(t: TargetPrompt): string {
  switch (t.action) {
    case 'debt_collector':
      return `Pick who pays ${money(t.amount ?? 5)}`;
    case 'rent_player':
      return t.amount ? `Pick who pays the ${money(t.amount)} rent` : targetLabel.rent_player;
    case 'forced_deal':
      return t.step === 'own' ? 'Pick your property to give' : 'Pick a property to swap for';
    case 'building':
      return `Place a ${t.building === 'hotel' ? 'Hotel' : 'House'} on a complete set`;
    default:
      return targetLabel[t.action];
  }
}

/** The line under it: where to look and what to tap. */
function targetHint(t: TargetPrompt, focusName?: string, brief = false): string {
  if (t.action === 'rent') return 'your table · tap a set — its ₹ is what it charges';
  if (t.action === 'building') return 'your table · tap a set that glows';
  if (t.action === 'forced_deal' && t.step === 'own') return 'your table · a complete set can’t be traded';
  if (focusName) return `${focusName}'s table · switch rival below`;
  return brief ? 'tap a rival' : 'the whole table · tap the rival you want to play against';
}

interface TableScreenProps {
  g: TableGame;
  /** Extra HUD buttons, right of the built-in ones. */
  hudRight?: ReactNode;
  /** Drawn inside the table's frame, above everything (sheets, dialogs). */
  children?: ReactNode;
}

/** The whole game screen: HUD, the camera on the felt, the hand tray and the stage that acts out what just happened. */
export function TableScreen({ g, hudRight, children }: TableScreenProps) {
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
  /** A wild in one of your sets, picked to flip. */
  const [selBoard, setSelBoard] = useState<string | null>(null);
  const [wildAsk, setWildAsk] = useState<string | null>(null);
  const { peek, bind: peekBind, close: closePeek, pin: pinPeek } = usePeek(camRef);
  const targeting = p?.kind === 'target' ? p : null;
  const targetCard = targeting?.card ?? undefined;
  const discarding = p?.kind === 'discard' ? p : null;
  const jsnAsk = p?.kind === 'jsn' ? p : null;
  const zones = seatZones(g.rivals);
  /** The picks that aim at one of your own sets, so the camera stays on you. */
  const ownPick = targeting?.action === 'rent' || targeting?.action === 'building' || (targeting?.action === 'forced_deal' && targeting.step === 'own');
  /** With a single rival there is nobody to choose between: the camera goes straight to them. */
  const soleRival = g.rivals.length === 1 ? g.rivals[0]!.id : null;
  /** Forced Deal, rival step: your property that goes across, with the colour of the set it leaves. */
  const giveCard = (() => {
    if (!targeting?.give) return null;
    for (const s of g.me.sets) {
      const c = s.cards.find((x) => x.id === targeting.give);
      if (c) return { card: c, color: s.color };
    }
    return null;
  })();
  /** Who the viewer is waiting on ("Priya is choosing who pays…"): their seat pulses. The line only carries names, so match them as whole words. */
  const waitingOn = new Set(g.wait ? g.rivals.filter((r) => new RegExp(`(^|[^\\p{L}\\p{N}])${r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(g.wait!)).map((r) => r.id) : []);

  // The camera follows the game unless you pointed it somewhere; every beat of the game re-arms it.
  useEffect(() => setManual(null), [g.phase, g.turn, p?.kind, targeting?.action, targeting?.step]);
  useEffect(() => {
    setSel(null);
    setWildAsk(null);
  }, [g.hand.length, p?.kind, g.canAct]);
  /** Where the camera goes while the viewer waits on rivals: the one who owes, or the table when several do. */
  const waitCam: Cam = waitingOn.size === 1 ? [...waitingOn][0]! : 'table';
  const auto: Cam =
    p?.kind === 'pay' || p?.kind === 'jsn' || ownPick
      ? 'me'
      : targeting
        ? (soleRival ?? 'table')
        : g.wait
          ? waitCam
          : g.phase === 'rivals'
          ? g.turn
          : g.phase === 'draw'
            ? 'centre'
            : 'me';
  const cam: Cam = stageCam ?? manual ?? auto;
  useEffect(closePeek, [cam, closePeek]);
  useEffect(() => setSelBoard(null), [cam, g.canRearrange, p?.kind]);
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
    if (cam === 'table' || peekWas.current || p?.kind === 'pay') return;
    if ((e.target as HTMLElement).closest('button, .tb-mine, .tb-zone, .tb-loupe, .tb-banner')) return;
    setManual('table');
  };
  const zoomedOnSeat = cam !== 'table' && cam !== 'me' && cam !== 'centre' && cam !== 'deal';
  const focusSeat = zoomedOnSeat ? g.rivals.find((r) => r.id === cam) : undefined;
  // What sits over the top of the camera (the target / discard banner, the Just Say No alert) and so is kept clear.
  const topInset = jsnAsk ? JSN_H : targeting || discarding ? BANNER_H : 0;
  // A seat with the camera fills the screen minus the banner above it (while aiming) and the switcher below.
  const inset = { top: topInset, bottom: SWITCH_H };
  // Any other view only needs to clear the banner; there is no switcher there.
  const tableInset = topInset && !focusSeat ? { top: topInset + (cam === 'me' ? PUCK_ROOM : 0), bottom: 0 } : undefined;
  const seatView = { w: vp.w, h: vp.h - inset.top - inset.bottom };
  const aim: RivalAim | undefined = focusSeat && targeting && !ownPick ? (targeting.action as RivalAim) : undefined;
  const focus = focusSeat ? focusLayout(focusSeat, zones[focusSeat.id]!, seatView, (s) => (aim === 'sly_deal' || aim === 'forced_deal') && isPickable(aim, s)) : undefined;
  const mine = mineLayout(g.me.sets, { w: vp.w, h: vp.h - (topInset ? topInset + PUCK_ROOM : 0) });
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

  const isJsn = (c: Card) => c.kind === 'action' && c.action === 'just_say_no';
  const { drag, bind } = useCardDrag({
    onTap: (id) => {
      // Hand-limit discard: a tap marks the card. A Just Say No prompt: a tap on a glowing Just Say No plays it.
      if (discarding) return g.actions.discard(id);
      if (jsnAsk) {
        const c = g.hand.find((x) => x.id === id);
        return c && isJsn(c) ? g.actions.jsn(id) : undefined;
      }
      setSelBoard(null);
      setSel((s) => (s === id ? null : id));
    },
    onLift: () => {
      setSel(null);
      setSelBoard(null);
      setManual('me');
    },
    onDrop: (id, hit) => {
      // Throwing a card on the discard pile marks it for the hand-limit discard (a second throw takes it back).
      if (discarding) return hit.zone === 'play' ? g.actions.discard(id) : undefined;
      if (!g.canAct) return;
      if (hit.x !== undefined && hit.y !== undefined) letGo.current = { id, x: hit.x, y: hit.y, at: performance.now() };
      if (hit.zone) dropCard(id, hit.zone, hit.color);
    },
    enabled: g.canAct || !!discarding || !!jsnAsk,
  });
  /** The wild the colour sheet is about; gone from the hand (played, discarded) closes the sheet. */
  const wildAskCard = wildAsk ? g.hand.find((c) => c.id === wildAsk) : undefined;
  const dragCard = drag ? g.hand.find((c) => c.id === drag.cardId) : undefined;
  const selCard = sel ? g.hand.find((c) => c.id === sel) : undefined;
  const hotZones = new Set(dragCard && g.canAct ? zonesFor(dragCard) : []);
  const focusColors = dragCard ? buildColors(dragCard) : [];
  const playHot = !!dragCard && (hotZones.has('play') || !!discarding);

  // Carrying a playable card, the camera keeps the discard pile in frame along with your seat, so both drop targets are on screen.
  const cm = camera(cam, vp, spanning({ x: 0, y: 0, ...WORLD }, far.rect), focus?.rect ?? (cam === 'me' ? (playHot ? spanning(mine.rect, CENTRE) : mine.rect) : cam === 'deal' ? spanning(far.rect, CENTRE) : undefined), focus ? inset : tableInset);

  // What just happened on the table plays out on the stage; each commit then re-reads where everything stands,
  // so the next beat can find the cards this one takes away.
  const lastBeat = useRef(0);
  /** Cards put down and awaiting the server, as the stage last saw them: what is parked, so a change can be told from a first sight. */
  const parked = useRef(new Map<string, SentPlay>());
  /** Where a parked card stood when a beat lifted it off the stage, for the beat's other cards to start from. */
  const lifted = useRef(new Map<string, { spot: Spot; at: number }>());

  /** Where a card the viewer just put down goes to wait: the bank, the set it joins (its seat, if none yet) or the pile. */
  const parkTarget = (o: SentPlay) => {
    const me = g.me.id;
    if (o.zone === 'bank') return stage.target(`[data-peek="${bankKey(me)}"] .cash-pile`, `[data-peek="${bankKey(me)}"]`, `[data-seat="${me}"]`);
    if (o.zone === 'play') return stage.target('[data-fly="discard"]');
    const set = o.color ? g.me.sets.find((x) => x.color === o.color && !isComplete(x)) : undefined;
    return stage.target(`[data-cid="${o.card.id}"]`, ...(set ? [`[data-peek="${setKey(me, set.id)}"]`] : []), `[data-seat="${me}"]`);
  };

  /** Cards put down and not yet confirmed: park them where they were put; take them back if the server refused. */
  const syncSent = () => {
    const now = new Set(g.sent.map((o) => o.card.id));
    for (const o of g.sent) {
      const id = o.card.id;
      if (parked.current.has(id)) continue;
      parked.current.set(id, o);
      const d = letGo.current;
      const at = tableRef.current?.getBoundingClientRect();
      // From where the finger let go; a tap on a pill has no such place, so from the card's slot in the hand.
      const from =
        d && d.id === id && at && performance.now() - d.at < 1500
          ? stage.screenSpot(d.x - at.left, d.y - at.top, 90)
          : (stage.snap(id) ?? stage.screenSpot(stage.size.w / 2, stage.size.h - 92));
      park(stage, { card: o.card, from, to: parkTarget(o) });
    }
    for (const [id, o] of parked.current) {
      if (now.has(id)) continue;
      parked.current.delete(id);
      const key = parkKey(id);
      if (g.hand.some((c) => c.id === id)) {
        // Refused (or never heard): the card is back in the hand; the parked copy flies home to it.
        const a = stage.take(key);
        if (a?.last) bounce(stage, o.card, stage.screenSpot(a.last.x, a.last.y, a.last.w ?? 90), stage.target(`[data-cid="${id}"]`));
      } else if (stage.actors.some((a) => a.key === key)) {
        // The game has moved but its scene is queued behind another: the real card waits out of sight until it is
        // this card's turn (its beat settles the parked one), and is let through if that turn never comes.
        if (o.zone === 'build') stage.hide(id);
        stage.later(1500, () => {
          if (stage.take(key)) stage.show(id);
        });
      }
    }
  };

  useLayoutEffect(() => {
    const b = g.beat;
    if (b && b.id !== lastBeat.current) {
      lastBeat.current = b.id;
      perform(b, {
        me: g.me.id,
        stage,
        tint: (id) => g.rivals.find((r) => r.id === id)?.color ?? theme.selfColor,
        dropped: (id) => {
          // A card of yours that was parked: the beat carries on from where it stood.
          const a = stage.actors.find((x) => x.key === parkKey(id));
          if (a) {
            stage.take(a.key);
            if (a.last) lifted.current.set(id, { spot: stage.screenSpot(a.last.x, a.last.y, a.last.w ?? 90), at: performance.now() });
          }
          const l = lifted.current.get(id);
          if (l && performance.now() - l.at < 3000) return l.spot;
          const d = letGo.current;
          const o = tableRef.current?.getBoundingClientRect();
          if (!d || d.id !== id || !o || performance.now() - d.at > 2500) return null;
          return stage.screenSpot(d.x - o.left, d.y - o.top, 90);
        },
        hold: holdCam,
      });
    }
    syncSent();
    stage.snapshot();
  });

  // What letting go would do, in words.
  const predict = (card: Card, zone: string | null, color?: string): string | null => {
    if (!g.canAct) return null;
    if (zone === 'bank') return zonesFor(card).includes('bank') ? `Bank ${money(card.value)}` : 'Can’t bank this';
    if (zone === 'build') {
      if (!zonesFor(card).includes('build')) return 'Not a property';
      // A plain property builds its own colour wherever it lands; a wild takes the set it is dropped on, if it can be that colour.
      const options = buildColors(card);
      const c = card.kind === 'property' ? options[0] : color ? (options.includes(color as PropertyColor) ? (color as PropertyColor) : undefined) : options[0];
      return c ? `Build ${stateName(c)}` : 'Can’t be that colour';
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
  const tag =
    drag && dragCard
      ? discarding
        ? drag.zone === 'play'
          ? discarding.sel.includes(dragCard.id)
            ? 'Keep it'
            : 'Discard it'
          : null
        : predict(dragCard, drag.zone, drag.color)
      : null;

  // ── pills over a tapped card ──
  type Pill = { key: string; label: string; sub?: string; act(): void; gold?: boolean; testId?: string; dot?: string };
  /** The wild picked in one of your sets, with the set it sits in. */
  const boardPick = (() => {
    if (!selBoard || !g.canRearrange) return null;
    for (const s of g.me.sets) {
      const c = s.cards.find((x) => x.id === selBoard);
      if (c && c.kind === 'property_wild') return { card: c, set: s };
    }
    return null;
  })();
  const flipTargets = boardPick ? wildColors(boardPick.card).filter((c) => c !== boardPick.set.color) : [];
  const pills = (() => {
    const out: Pill[] = [];
    if (boardPick) {
      // Flipping a wild is a move to its other colour; with a rainbow wild there is one pill per colour.
      const many = flipTargets.length > 3;
      for (const c of flipTargets) {
        const have = g.me.sets.find((s) => s.color === c && !isComplete(s))?.cards.length ?? 0;
        out.push({
          key: `flip${c}`,
          label: many ? stateName(c) : `Flip to ${stateName(c)}`,
          // A long row of colours keeps to names; what they cost is said once, in the hint above them.
          sub: many ? undefined : isComplete(boardPick.set) ? 'breaks a set' : have + 1 >= setSize(c) ? 'completes set' : `${have + 1}/${setSize(c)}`,
          testId: flipTargets.length === 1 ? `flip-wild-btn-${boardPick.card.id}` : `flip-wild-btn-${boardPick.card.id}-${c}`,
          gold: have + 1 >= setSize(c) && !isComplete(boardPick.set),
          dot: many ? colorOf(c) : undefined,
          act: () => {
            setSelBoard(null);
            g.actions.rearrange(boardPick.card.id, c);
          },
        });
      }
      return out;
    }
    if (!selCard || !g.canAct) return out;
    for (const z of zonesFor(selCard)) {
      if (z === 'play') out.push({ key: 'play', label: `Play ${cardName(selCard)}`, act: () => dropCard(selCard.id, 'auto'), gold: true });
      if (z === 'build')
        for (const c of buildColors(selCard)) {
          const have = g.me.sets.find((s) => s.color === c && !isComplete(s))?.cards.length ?? 0;
          const done = have + 1 >= setSize(c);
          out.push({ key: `b${c}`, label: `Build ${stateName(c)}`, sub: done ? 'completes set' : `${have + 1}/${setSize(c)}`, act: () => dropCard(selCard.id, 'build', c), gold: done, dot: buildColors(selCard).length > 3 ? colorOf(c) : undefined });
        }
      if (z === 'bank') out.push({ key: 'bank', label: `Bank ${money(selCard.value)}`, act: () => dropCard(selCard.id, 'bank') });
    }
    return out;
  })();

  // ── the seat plates ──
  const seatZone = (r: Seat) => {
    const z = zones[r.id]!;
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
        data-waiting={waitingOn.has(r.id)}
        data-focus={!!near}
        data-lod={near ? 'near' : 'far'}
        data-player-id={r.id}
        // The focused seat is the spotlight; while one is, the rivals are the switcher's tabs, not seats.
        data-testid={near ? 'opponent-spotlight' : zoomedOnSeat ? undefined : `opponent-peer-${r.id}`}
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
        <Glance seat={r} testId={targeting?.action === 'debt_collector' ? `debt-collector-player-${r.id}` : targeting?.action === 'rent_player' ? `rent-player-${r.id}` : undefined} />
        {near && <RivalNear seat={r} size={rect} cardW={near.cardW} aim={aim} onTarget={g.actions.target} onOpenBank={openBank(r.id)} />}
        {near && d >= 2 && <span className="tb-zone__warn">1 SET FROM WINNING</span>}
      </section>
    );
  };

  // With the camera on it your seat is the panel above; otherwise it sits in its usual spot, its tiles fitted to that.
  const mineNear = cam === 'me';
  const [mineBodyRef, mineMore] = useScrollMore<HTMLDivElement>(mineNear && mine.scroll);
  const mz = mineNear ? mine.rect : far.rect;
  const mineW = mineNear ? mine.cardW : far.cardW;
  const bankHot = !!dragCard && hotZones.has('bank');
  const rentPick = targeting?.action === 'rent';
  const buildPick = targeting?.action === 'building';
  const giveOwn = targeting?.action === 'forced_deal' && targeting.step === 'own';
  const selSum = p?.kind === 'pay' ? paySum(g, p.sel) : 0;
  /** Cards in your sets that are part of a complete set: paying with one breaks the set. */
  const lockedIds = new Set(g.me.sets.filter(isComplete).flatMap((s) => s.cards.map((c) => c.id)));
  /** Just Say No cards in your hand, for the alert's buttons. */
  const jsnCards = g.hand.filter(isJsn);
  const actor = g.rivals.find((r) => r.id === g.turn);
  const puck = zones[g.turn] ?? ME_ZONE;
  const last = g.feed[g.feed.length - 1];

  // ── HUD line ──
  const hud = (() => {
    if (g.won) return g.won === g.me.id ? 'You win!' : `${g.rivals.find((r) => r.id === g.won)?.name ?? 'Someone'} wins`;
    if (p?.kind === 'pay') return `${g.rivals.find((r) => r.id === p.toId)?.name} wants ${money(p.amount)}`;
    if (p?.kind === 'jsn') return `${g.rivals.find((r) => r.id === p.fromId)?.name} · ${p.label}!`;
    if (targeting) return `Playing ${targetCard ? cardName(targetCard) : 'a card'}`;
    if (p?.kind === 'discard') return `Hand limit — discard ${p.excess}`;
    if (g.wait) return g.wait;
    if (g.phase === 'draw') return 'Your turn — draw 2';
    if (g.phase === 'rivals') return `${actor?.name ?? ''} is ${actor && !actor.connected ? 'away' : 'playing'}`;
    return g.plays === 0 ? 'No plays left' : `Your turn · ${g.plays} play${g.plays === 1 ? '' : 's'} left`;
  })();

  const fan = handLayout(g.hand.length, tray.w, table.h);

  // ── end-turn / primary button ──
  let cta: { label: string; sub?: string; tone?: string; onClick?: () => void; disabled?: boolean; testId?: string } = { label: 'END', sub: 'TURN', onClick: g.actions.endTurn, testId: 'end-turn-btn' };
  if (p?.kind === 'pay') cta = { label: 'PAY', sub: money(selSum), tone: 'green', onClick: g.actions.payConfirm, disabled: !p.valid, testId: 'confirm-payment-btn' };
  else if (p?.kind === 'jsn') cta = { label: 'NO!', sub: 'JUST SAY', tone: 'red', onClick: () => g.actions.jsn(), disabled: !g.hasJsn, testId: 'jsn-play-btn' };
  else if (targeting?.action === 'debt_collector' && focusSeat) cta = { label: 'TAKE', sub: money(targeting.amount ?? 5), tone: 'green', onClick: () => g.actions.target({ rivalId: focusSeat.id }) };
  else if (targeting?.action === 'rent_player' && focusSeat) cta = { label: 'CHARGE', sub: money(targeting.amount ?? 0), tone: 'green', onClick: () => g.actions.target({ rivalId: focusSeat.id }) };
  else if (targeting) cta = g.actions.cancel ? { label: 'BACK', tone: 'ghost', onClick: g.actions.cancel } : { label: '···', disabled: true };
  else if (p?.kind === 'discard') cta = p.sel.length >= p.excess ? { label: 'DISCARD', sub: `${p.excess}`, tone: 'red', onClick: g.actions.discardConfirm, testId: 'confirm-discard-btn' } : { label: `−${p.excess - p.sel.length}`, disabled: true };
  else if (g.wait) cta = { label: '···', disabled: true };
  else if (g.phase === 'draw') cta = { label: 'DRAW', sub: '+2', tone: 'gold', onClick: g.actions.draw, testId: 'draw-btn' };
  else if (g.phase === 'rivals') cta = { label: '···', disabled: true };
  else if (g.plays === 0) cta = { ...cta, tone: 'gold' };
  // Sent and waiting on the server: the button says so, and cannot be pressed again.
  if (g.sending) cta = { ...cta, sub: 'SENDING', onClick: undefined, disabled: true };

  return (
    <ChromeBoundary items={g.feed}>
    <div className="gl">
      <div className="gl__stage">
        <div className="gl__phone">
    <div className="tb" ref={tableRef} data-mode={p?.kind ?? g.phase} data-sending={g.sending ?? undefined} aria-busy={g.sending ? true : undefined}>
      {/* ── HUD ── */}
      <header className="tb-hud">
        <Ring value={g.secs === null ? 0 : g.secs / g.maxSecs} size={40} stroke={4} color={(g.secs ?? 99) <= 10 ? '#ff6b57' : '#f2c14e'} track="#ffffff22">
          <span className="tb-hud__t">{g.secs === null ? '—' : clock(g.secs)}</span>
        </Ring>
        <span className="tb-hud__line" data-testid="turn-banner" data-turn-id={g.turn}>
          <b>{hud}</b>
          <small>
            {last?.who && `${last.who} `}
            {last?.text}
          </small>
        </span>
        <FeedButton />
        <button type="button" className="tb-hud__btn" data-on={cam === 'table'} onClick={() => setManual(cam === 'table' ? 'me' : 'table')} aria-label="See the whole table" aria-pressed={cam === 'table'}>
          <Icon name="menu" />
        </button>
        {hudRight}
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

          <div className="tb-centre" style={vars({ left: CENTRE.x, top: CENTRE.y, width: CENTRE.w, height: CENTRE.h, '--pile-w': `${PILE_W}px` })}>
            <button type="button" className="tb-deck" data-testid="draw-pile" data-fly="deck" data-ready={g.phase === 'draw'} onClick={g.actions.draw} aria-label={`Draw pile, ${g.deck} cards`}>
              <CardBack w={PILE_W} />
              <i>{g.deck}</i>
              {g.phase === 'draw' && <em>TAP TO DRAW 2</em>}
            </button>
            <div className="tb-pile">
              <span className="tb-discard" data-testid="discard-drop" aria-label="Discard pile" data-zone="play" data-hot={playHot} data-discarding={discarding ? true : undefined} data-fly="discard" data-cid={g.discardTop?.id}>
                {g.discardTop && <Cd card={g.discardTop} w={PILE_W} />}
              </span>
              <em className="tb-pile__lab">DISCARD</em>
            </div>
          </div>

          <section
            className="tb-mine"
            data-testid="self-stage"
            data-seat={g.me.id}
            style={vars({ left: mz.x, top: mz.y, width: mz.w, height: mz.h })}
            data-zone="auto"
            data-hot={!!dragCard && g.canAct}
            data-focus={mineNear}
            data-grown={mz.h > ME_ZONE.h}
            data-scroll={mineNear && mine.scroll}
            onClick={() => cam !== 'me' && setManual('me')}
          >
            <header className="tb-mine__head" data-testid="table-seat-self">
              <span className="tb-av tb-av--me">★</span>
              <b>You</b>
              <Pips sets={g.me.sets} big />
              <span className="tb-mine__rent">rent shown under each set</span>
            </header>
            <div className="tb-mine__body" ref={mineBodyRef} data-more={mineMore}>
              <div className="tb-mine__sets" data-testid="properties-drop">
                <BankTile
                  cards={g.me.bank}
                  w={mineW}
                  seatId={g.me.id}
                  owner="Your"
                  drop
                  testId="bank-drop"
                  hot={bankHot}
                  dim={(!!dragCard && !bankHot) || rentPick || buildPick || giveOwn}
                  extra={g.sent.filter((o) => o.zone === 'bank').length}
                  onOpen={openBank(g.me.id)}
                />
                {g.me.sets.map((s) => {
                  const rentAmt = rentPick ? targeting.colors?.find((c) => c.color === s.color)?.amount : undefined;
                  const rentOk = rentAmt !== undefined;
                  const buildOk = buildPick && !!targeting.eligibleSets?.includes(s.id);
                  const whole = rentOk || buildOk;
                  const giveOk = giveOwn && !isComplete(s);
                  const dropHot = !!dragCard && hotZones.has('build') && focusColors.includes(s.color) && !isComplete(s);
                  const flipOk = mineNear && g.canRearrange && !p && !dragCard;
                  const flips = (c: Card) => flipOk && c.kind === 'property_wild' && wildColors(c).some((x) => x !== s.color);
                  return (
                    <TbSet
                      key={s.id}
                      set={s}
                      w={mineW}
                      peek={setKey(g.me.id, s.id)}
                      zone
                      hot={dropHot || whole}
                      dim={(!!dragCard && hotZones.has('build') && !focusColors.includes(s.color)) || (rentPick && !rentOk) || (buildPick && !buildOk) || (giveOwn && !giveOk)}
                      onPick={rentOk ? () => g.actions.target({ color: s.color }) : buildOk ? () => g.actions.target({ setId: s.id }) : undefined}
                      chip={rentOk ? money(rentAmt) : buildOk ? `+${money(targeting.building === 'hotel' ? 4 : 3)} rent` : undefined}
                      testId={rentOk ? `rent-color-${s.color}` : buildOk ? `building-set-${s.id}` : undefined}
                      mark={
                        p?.kind === 'jsn'
                          ? (c) => (c.id === p.at?.id ? 'hit' : undefined)
                          : giveOwn
                            ? () => (giveOk ? 'pick' : 'dim')
                            : (c) => (flips(c) ? (selBoard === c.id ? 'sel' : 'tap') : undefined)
                      }
                      onCard={
                        giveOk
                          ? (c) => g.actions.target({ cardId: c.id })
                          : flipOk
                            ? (c) => {
                                setSel(null);
                                setSelBoard((cur) => (cur === c.id ? null : c.id));
                              }
                            : undefined
                      }
                      cardTestId={(c) => (giveOk ? `steal-card-${c.id}` : `board-card-${c.id}`)}
                    />
                  );
                })}
                {g.me.sets.length === 0 && <span className="tb-empty">throw a property here</span>}
              </div>
            </div>
          </section>

          <span className="tb-puck" style={vars({ left: puck.x + 8, top: puck.y - 44 })} aria-hidden>
            <b>TURN</b>
          </span>
        </div>

        {/* target / prompt banners live above the camera */}
        {targeting && (
          <div className="tb-banner" data-testid={TARGET_TESTID[targeting.action]} data-action={targeting.action}>
            <b>{targetTitle(targeting)}</b>
            <span>
              {giveCard && (
                <>
                  Swap your <i className="tb-banner__dot" style={vars({ '--c': colorOf(giveCard.color) })} aria-hidden />
                  <em>{cardName(giveCard.card)}</em> for…{' '}
                </>
              )}
              {targetHint(targeting, focusSeat?.name, !!giveCard)}
            </span>
          </div>
        )}
        {discarding && (
          <div className="tb-banner tb-banner--row" data-testid="hand-limit-prompt" data-ready={discarding.sel.length >= discarding.excess}>
            <div>
              <b>
                Discard {Math.min(discarding.sel.length, discarding.excess)} of {discarding.excess}
              </b>
              <span>Tap cards, or drag them to the pile</span>
            </div>
            {discarding.canResume && (
              <button type="button" data-testid="resume-play-btn" onClick={g.actions.resumePlay}>
                Play instead
              </button>
            )}
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
                  data-waiting={waitingOn.has(r.id)}
                  data-away={!r.connected}
                  data-testid={`opponent-peer-${r.id}`}
                  style={vars({ '--seat': r.color })}
                  onClick={() => setManual(r.id)}
                >
                  <i aria-hidden />
                  <span>{r.name}</span>
                  {!r.connected && <small className="tb-seats__away">away</small>}
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
          <div className="tb-tag" style={vars({ left: tagLeft(drag.x, tag, tableRef.current), top: Math.max(drag.y - 108, 8) })} data-bad={/Can’t|Not a/.test(tag)}>
            {tag}
          </div>
        )}
      </main>

      {/* ── Tray: hand, or the payment ── */}
      <footer
        className="tb-tray"
        data-pay={p?.kind === 'pay' ? true : undefined}
        data-testid="hand-fan"
        ref={trayRef}
        data-dim={g.phase === 'rivals' && !p}
        style={fan.trayH && p?.kind !== 'pay' ? vars({ '--tray-h': `${fan.trayH}px` }) : undefined}
      >
        {pills.length > 0 && (
          <div className="tb-pills" data-many={pills.length > 3}>
            {boardPick && pills.length > 3 && (
              <span className="tb-pills__hint">
                Flip to…{isComplete(boardPick.set) && <small> breaks your {stateName(boardPick.set.color)} set</small>}
              </span>
            )}
            <div className="tb-pills__row">
              {pills.map((pl) => (
                <button key={pl.key} type="button" data-gold={pl.gold} data-testid={pl.testId} onClick={pl.act}>
                  {pl.dot && <i style={vars({ '--c': pl.dot })} aria-hidden />}
                  <b>{pl.label}</b>
                  {pl.sub && <small>{pl.sub}</small>}
                </button>
              ))}
            </div>
          </div>
        )}
        {p?.kind === 'pay' ? (
          <div className="tb-pay" data-testid="payment-prompt" role="dialog" aria-label={`Pay ${money(p.amount)}`}>
            <div className="tb-pay__head">
              <b>Pay {money(p.amount)}</b>
              <span>
                to {g.rivals.find((r) => r.id === p.toId)?.name ?? 'them'} · {p.reason}
              </span>
            </div>
            <div className="tb-pay__cards">
              {payAssets(g).map((c) => {
                const breaks = lockedIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-testid={`payment-card-${c.id}`}
                    data-pay={c.id}
                    data-on={p.sel.includes(c.id)}
                    data-breaks={breaks ? true : undefined}
                    onClick={() => g.actions.paySel(c.id)}
                    aria-pressed={p.sel.includes(c.id)}
                    aria-label={breaks ? `${cardName(c)}, breaks a set` : cardName(c)}
                  >
                    <Cd card={c} w={62} />
                    {breaks && <em className="tb-pay__breaks">Breaks a set</em>}
                    {p.sel.includes(c.id) && (
                      <span>
                        <Icon name="check" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="tb-pay__foot">
              <button type="button" className="tb-pay__auto" onClick={g.actions.payAuto}>
                Auto-pick
              </button>
              <span className="tb-pay__sum" data-ok={p.valid}>
                {money(selSum)} of {money(p.amount)}
              </span>
            </div>
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
                data-glow={p?.kind === 'jsn' && isJsn(c)}
                data-discard={p?.kind === 'discard'}
                data-picked={discarding?.sel.includes(c.id) ? true : undefined}
                data-testid={`hand-card-${c.id}`}
                data-card-id={c.id}
                style={vars({ '--i': i, '--x': `${at.x}px`, '--y': `${at.y}px`, '--r': `${at.r}deg`, '--hw': `${fan.w}px` })}
                {...bind(c.id)}
                aria-label={cardName(c)}
              >
                <Cd card={c} w={fan.w} />
                {discarding?.sel.includes(c.id) && (
                  <span className="tb-card__check" aria-hidden>
                    <Icon name="check" />
                  </span>
                )}
              </div>
            );
          })
        )}
        <button type="button" className="tb-cta" data-sending={g.sending ? true : undefined} data-tone={cta.tone} data-len={cta.label.length > 6 ? 'long' : cta.label.length > 4 ? 'mid' : undefined} disabled={cta.disabled} onClick={cta.onClick} data-testid={cta.testId}>
          <b>{cta.label}</b>
          {cta.sub && <small>{cta.sub}</small>}
        </button>
      </footer>
      <DragGhost drag={drag} card={dragCard} w={90} />

      {wildAskCard && (
        <Ask onClose={() => setWildAsk(null)} title="Which set does it join?" many={buildColors(wildAskCard).length > 3}>
          {buildColors(wildAskCard).map((c) => (
            <button
              key={c}
              type="button"
              style={vars({ '--c': colorOf(c) })}
              onClick={() => {
                g.actions.play(wildAskCard.id, 'build', c);
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

      {jsnAsk && (
        <div className="tb-alert" data-testid={`jsn-prompt${jsnAsk.payerId ? `-${jsnAsk.payerId}` : ''}`} role="alert">
          <span className="tb-alert__face">
            <Cd card={jsnAsk.card} w={52} />
          </span>
          <div className="tb-alert__body">
            <b>{jsnAsk.label}</b>
            <span>{jsnAsk.threat}.</span>
            <div className="tb-alert__acts">
              {jsnCards.map((c) => (
                <button key={c.id} type="button" className="tb-alert__no" data-testid={`jsn-play-${c.id}`} onClick={() => g.actions.jsn(c.id)} aria-label="Play Just Say No">
                  <Cd card={c} w={22} />
                  <b>NO!</b>
                </button>
              ))}
              <button type="button" className="tb-alert__let" data-testid={`jsn-decline-btn${jsnAsk.payerId ? `-${jsnAsk.payerId}` : ''}`} onClick={g.actions.allow}>
                Let it go
              </button>
            </div>
          </div>
        </div>
      )}

      <ChromeOverlays />
      <Confirms confirm={g.confirm} />
      {children}
      <Victory g={g} />
      <StageLayer stage={stage} />
    </div>
        </div>
      </div>
    </div>
    </ChromeBoundary>
  );
}

/** The prediction tag rides above the finger but stays inside the table's frame, so it never clips at the screen edge. */
function tagLeft(x: number, tag: string, frame: HTMLElement | null): number {
  const o = frame?.getBoundingClientRect();
  if (!o) return x;
  const half = Math.ceil(tag.length * 9.6 + 36) / 2 + 8;
  return Math.min(Math.max(x, o.left + half), o.right - half);
}

function Ask({ children, title, many, onClose }: { children: ReactNode; title: string; many?: boolean; onClose(): void }) {
  return (
    <div className="tb-ask" data-many={many} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>
        <b>{title}</b>
        <span>{children}</span>
      </div>
    </div>
  );
}
