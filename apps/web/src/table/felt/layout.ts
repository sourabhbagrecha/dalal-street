import type { PropertySet } from '@monopoly-deal/shared';
import type { Seat } from '../model';
import { stateName } from '../model';

/**
 * The felt's geometry: the world the camera looks at, where every seat sits on it, how big the cards in a seat can
 * be, and the camera transform that frames any of it. Pure math, no React.
 */

// World units are "zoomed-in" pixels; the camera scales the world down to fit.
export const WORLD = { w: 1160, h: 1240 };
export type Rect = { x: number; y: number; w: number; h: number };
export const ME_ZONE: Rect = { x: 270, y: 800, w: 620, h: 430 };
/** Where rivals sit, by how many there are. Rivals are listed in turn order after you, so they run round the table clockwise. */
// left/right sit close to the world's own edges; their far-view glance panel (.tb-glance, gl-table.css) is a fixed
// 128px screen width, counter-scaled and centred on the seat's on-screen midpoint. At the whole-table camera's zoom
// on a narrow phone, that half-width alone can land past x:0 for the seat nearest the world's left/right edge.
// Pulled in from x:20/790 to x:50/760 so the panel clears the screen at 360-390px wide.
const SEAT = { left: { x: 50, y: 420, w: 350, h: 368 }, topLeft: { x: 150, y: 50, w: 350, h: 368 }, top: { x: 405, y: 50, w: 350, h: 368 }, topRight: { x: 660, y: 50, w: 350, h: 368 }, right: { x: 760, y: 420, w: 350, h: 368 } };
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
/** Tile chrome under the cards: padding (4), gap (7) and a two-line label (2 × 15.75 + 3). */
const TILE_CHROME_H = 46;
/** The label wraps at spaces, so a tile is never narrower than its longest word, and never narrower than this. */
const TILE_LABEL_MIN_W = 88;
/**
 * With the camera on a seat each set is labelled with its full state name (.tb-zone__near / .tb-mine .tb-set__lab:
 * 15px Mukta 900, uppercase, 0.8px tracking): the widest letters run ~10.3px, so "MAHARASHTRA" alone is ~114px, and a
 * name wider than its tile ("UTTAR PRADESH") wraps onto a line of its own. Rounded up, so the estimate errs wide.
 */
const LAB_CHAR_W = 10.5;
const LAB_LINE_H = 16;
/** The bank stack tilts, so it keeps a few px clear either side (.tb-bank .cash-pile). */
const BANK_TILT_ROOM = 12;

/** Sets dealt out card by card (Sly Deal picks), so they run wider than the usual overlap. */
type Spread = (s: PropertySet) => boolean;
const flat: Spread = () => false;

/** Lines `words` wrap into at spaces in a label `w` wide. */
function nameLines(words: string[], w: number): number {
  let lines = 1;
  let x = 0;
  for (const word of words) {
    const ww = word.length * LAB_CHAR_W;
    if (x > 0 && x + LAB_CHAR_W / 2 + ww > w) {
      lines++;
      x = ww;
    } else x += (x > 0 ? LAB_CHAR_W / 2 : 0) + ww;
  }
  return lines;
}

interface FlowOpts {
  spread?: Spread;
  /** Away from the camera: sets are labelled with a short code (so a name never widens a tile), and a tile spends this under its cards. */
  far?: number;
}

/** The height of each row the sets and the bank wrap into as tiles of card width `w` in a box `boxW` wide. */
function flowRows(sets: PropertySet[], w: number, boxW: number, { spread = flat, far }: FlowOpts = {}): number[] {
  const tile = (cardsW: number, name?: string) => {
    const words = far === undefined && name ? name.toUpperCase().split(/\s+/) : [];
    const inner = Math.max(cardsW, TILE_LABEL_MIN_W, ...words.map((x) => x.length * LAB_CHAR_W));
    return { w: inner + 4, lines: words.length ? nameLines(words, inner) : 1 };
  };
  const tiles = [tile(w + BANK_TILT_ROOM), ...sets.map((s) => tile(w + (s.cards.length - 1) * (spread(s) ? w + 8 : stepFor(w)), stateName(s.color)))];
  // Each row is as tall as its tallest label.
  const rows: number[] = [];
  let lines = 1;
  let x = 0;
  for (const t of tiles) {
    if (x > 0 && x + t.w > boxW) {
      rows.push(lines);
      lines = 1;
      x = 0;
    }
    x += t.w + MINE_GAP.x;
    lines = Math.max(lines, t.lines);
  }
  rows.push(lines);
  return rows.map((l) => (w * 7) / 5 + (far ?? TILE_CHROME_H) + (l - 1) * LAB_LINE_H);
}

/** The height rows of tiles take, stacked. */
const stackH = (rows: number[]) => rows.reduce((a, b) => a + b, 0) + (rows.length - 1) * MINE_GAP.y;

/** Narrowest a seat's cards get (world px) at camera scale `scale`: NEAR_CARD_PX on screen. */
const cardFloor = (scale: number) => Math.min(MINE_CARD_W.max, Math.max(MINE_CARD_W.min, Math.ceil(NEAR_CARD_PX / scale / 2) * 2));

/**
 * A seat with the camera on it: cards start at the biggest width and only shrink, never below `floor`, while the tiles
 * would need more than `rows` rows or more than `maxH`. Returns that width, the height the tiles need at it, and the
 * height the seat shows (at most `rows` rows and `maxH`); what does not fit scrolls inside the seat, the top of the
 * next row peeking out under the last whole one so it is plain there is more.
 */
function fitRows(sets: PropertySet[], boxW: number, maxH: number, floor: number, rows: number, spread?: Spread): { w: number; need: number; h: number } {
  let w = MINE_CARD_W.max;
  let r = flowRows(sets, w, boxW, { spread });
  while (w > floor && (r.length > rows || stackH(r) > maxH)) {
    w -= 2;
    r = flowRows(sets, w, boxW, { spread });
  }
  const need = stackH(r);
  const shown = r.length > rows ? stackH(r.slice(0, rows)) + MINE_GAP.y + ROW_PEEK : need;
  return { w, need, h: Math.min(need, shown, maxH) };
}

/** How much of the first hidden row (world px) peeks out under a scrolling seat's last whole one: the cards' price corners. */
const ROW_PEEK = 34;

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

/** Rows your seat shows at once with the camera on it. Fewer sets than fit are laid out whole; more, and the cards shrink to fit them, then the rest scrolls. */
const NEAR_ROWS = 2;
/** The same for a rival's panel, which has the whole view to itself and so shows a row more. */
const FOCUS_ROWS = 3;
/** Narrowest a seat's cards get on screen (css px) while they shrink: the app-wide card floor, so the rent figures stay readable. */
const NEAR_CARD_PX = 64;

/**
 * Where a rival's seat sits while it has the camera, and the card width inside it: centred on its usual spot and
 * only as big as its tiles need — the biggest cards that fit a panel of yours' size in FOCUS_ROWS rows, never below
 * NEAR_CARD_PX on screen, at the narrowest width that still holds them. Past FOCUS_ROWS rows the rest scrolls inside it.
 */
export function focusLayout(seat: Seat, zone: Rect, avail: { w: number; h: number }, spread: Spread): { rect: Rect; cardW: number; scroll: boolean } {
  const maxH = Math.min(WORLD.h - 100, Math.floor((avail.h * 0.94) / seatScale(avail.w)));
  // The camera frames the widest panel a shade under seatScale (0.94 of the view across, see camera()), so the floor is set against that.
  const floor = cardFloor(Math.min(seatScale(avail.w), (avail.w * 0.94) / FOCUS_W.max));
  let best: { w: number; fit: ReturnType<typeof fitRows> } | undefined;
  for (let w = FOCUS_W.min; w <= FOCUS_W.max; w += FOCUS_W.step) {
    const fit = fitRows(seat.sets, w - PANEL_CHROME.w, maxH - PANEL_CHROME.h, floor, FOCUS_ROWS, spread);
    const b = best?.fit;
    if (!b || fit.w > b.w || (fit.w === b.w && (fit.h < b.h || (fit.h === b.h && fit.need < b.need)))) best = { w, fit };
  }
  const { w, fit } = best!;
  const h = fit.h + PANEL_CHROME.h;
  const z = zone;
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  return { rect: { x: clamp(z.x + z.w / 2 - w / 2, WORLD.w - w), y: clamp(z.y + z.h / 2 - h / 2, WORLD.h - h), w, h }, cardW: fit.w, scroll: fit.need > fit.h };
}

/** What your own seat spends outside its tiles: border + padding across, border + padding + header + gap down (.tb-mine). */
const MINE_CHROME = { w: 56, h: 118 };
/** The share of the view your seat may fill; the rest stays bare table above and below it, to tap and zoom out. */
const NEAR_FILL = 0.7;

/**
 * Your seat with the camera on it: cards start at the biggest width (a rival's panel uses the same) and only shrink once
 * the tiles would need more than NEAR_ROWS rows or the panel would fill more than NEAR_FILL of the view, never below
 * NEAR_CARD_PX on screen. The panel keeps its top edge and grows downward, past the felt onto the rail, so it never covers
 * the deck, the discard pile or a rival. It shows at most NEAR_ROWS rows of tiles: what does not fit even at the
 * smallest cards scrolls inside it, the next row peeking out below.
 */
export function mineLayout(sets: PropertySet[], avail: { w: number; h: number }): { rect: Rect; cardW: number; scroll: boolean } {
  const z = ME_ZONE;
  const scale = seatScale(avail.w);
  const maxH = Math.floor((avail.h * NEAR_FILL) / scale);
  const fit = fitRows(sets, z.w - MINE_CHROME.w, maxH - MINE_CHROME.h, cardFloor(scale), NEAR_ROWS);
  const h = Math.max(z.h, fit.h + MINE_CHROME.h);
  return { rect: { x: z.x, y: z.y, w: z.w, h }, cardW: fit.w, scroll: fit.need + MINE_CHROME.h > h };
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
  while (w > MINE_CARD_W.min && flowRows(sets, w, boxW, { far: TILE_CHROME_H }).length > FAR_MINE_ROWS) w -= 2;
  const world: Rect = { x: 0, y: 0, ...WORLD };
  const at = (s: number) => {
    const chrome = farTileChrome(s, bankCount, Math.max(w + BANK_TILT_ROOM, TILE_LABEL_MIN_W) + 4);
    return { rect: { ...z, h: Math.max(z.h, Math.ceil(stackH(flowRows(sets, w, boxW, { far: chrome }))) + MINE_CHROME.h) }, cardW: w };
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
