import type { PropertySet } from '@monopoly-deal/shared';
import type { Seat } from '../model';

/**
 * The felt's geometry: the world the camera looks at, where every seat sits on it, how big the cards in a seat can
 * be, and the camera transform that frames any of it. Pure math, no React.
 */

// World units are "zoomed-in" pixels; the camera scales the world down to fit.
export const WORLD = { w: 1160, h: 1240 };
export type Rect = { x: number; y: number; w: number; h: number };
export const ME_ZONE: Rect = { x: 270, y: 800, w: 620, h: 430 };
/** Where rivals sit, by how many there are. Rivals are listed in turn order after you, so they run round the table clockwise. */
const SEAT = { left: { x: 20, y: 420, w: 350, h: 368 }, topLeft: { x: 150, y: 50, w: 350, h: 368 }, top: { x: 405, y: 50, w: 350, h: 368 }, topRight: { x: 660, y: 50, w: 350, h: 368 }, right: { x: 790, y: 420, w: 350, h: 368 } };
const SEATING: Rect[][] = [[], [SEAT.top], [SEAT.topLeft, SEAT.topRight], [SEAT.left, SEAT.top, SEAT.right], [SEAT.left, SEAT.topLeft, SEAT.topRight, SEAT.right]];
/** Each rival's zone on the felt, by seat id. */
export function seatZones(rivals: Seat[]): Record<string, Rect> {
  const slots = SEATING[Math.min(rivals.length, 4)]!;
  return Object.fromEntries(rivals.map((r, i) => [r.id, slots[i] ?? SEAT.top]));
}
export const CENTRE = { x: 400, y: 455, w: 360, h: 300 };
/** Draw and discard piles share one card width (world px): the focal point of the felt, so the biggest cards on it. */
export const PILE_W = 148;

/** 'deal' frames the deck and your seat together, for cards travelling between them. */
export type Cam = 'table' | 'me' | 'centre' | 'deal' | string;

/** Horizontal offset between overlapping cards in a set, as a share of card width. */
export const stepFor = (w: number) => Math.round(w * 0.34);

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
export const BANNER_H = 68;
/** The Just Say No alert (a contested card, the threat, the answers) is taller than the banner. */
export const JSN_H = 128;
/** The TURN puck sits over the top edge of the seat it marks; on your own seat, under a banner, it keeps this much room. */
export const PUCK_ROOM = 22;
export const SWITCH_H = 94;
/** The camera never zooms a rival in past the scale it uses on you, so their cards read as big as yours, not bigger. */
const SEAT_PAD = 0.97;
const seatScale = (vpW: number) => (vpW * SEAT_PAD) / ME_ZONE.w;

/**
 * Where a rival's seat sits while it has the camera, and the card width inside it: centred on its usual spot and
 * only as big as its tiles need — the biggest cards that fit a panel of yours' size, in the fewest rows, at the
 * narrowest width that still holds them.
 */
export function focusLayout(seat: Seat, zone: Rect, avail: { w: number; h: number }, spread: (s: PropertySet) => boolean): { rect: Rect; cardW: number } {
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
export function mineLayout(sets: PropertySet[], avail: { w: number; h: number }): { rect: Rect; cardW: number; scroll: boolean } {
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
export function farMineLayout(sets: PropertySet[], bankCount: number, vp: { w: number; h: number }): { rect: Rect; cardW: number } {
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
export function spanning(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function camera(cam: Cam, vp: { w: number; h: number }, table: Rect, seat?: Rect, inset = { top: 0, bottom: 0 }) {
  const rect: Rect = seat ?? (cam === 'table' ? table : cam === 'centre' ? CENTRE : ME_ZONE);
  const pad = cam === 'table' ? 1 : cam === 'me' ? SEAT_PAD : 0.94;
  const availH = vp.h - inset.top - inset.bottom;
  const s = Math.min((vp.w * pad) / rect.w, (availH * pad) / rect.h, seat ? seatScale(vp.w) : Infinity);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return { s, tx: vp.w / 2 - s * cx, ty: inset.top + availH / 2 - s * cy };
}
