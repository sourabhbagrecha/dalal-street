/**
 * Where each card of the hand sits in the table's tray (layout lab).
 *
 * Up to seven cards fan in one row. From eight up they split into two rows — the
 * bottom one, nearest the thumb, never shorter than the top — so a full nine-card
 * hand is 4 over 5 and every card keeps most of its width on show instead of a
 * sliver. The bottom row rides up over the top one by REVEAL of a card's height,
 * and the tray grows to hold both.
 */

/** Hand size at which the single row splits in two. */
export const TWO_ROWS_FROM = 8;

/** Room above the top row, so a card tilted at the row's end keeps its corner. */
const PAD = 18;
/** How far the bottom row starts below the top one, as a fraction of a card's height. */
const REVEAL = 0.6;
/** How much of the bottom row hangs off the tray's lower edge, as a fraction of a card's height. */
const BLEED = 0.1;
/** Share of the table's height the two-row tray is sized to take. */
const TRAY_SHARE = 0.24;
/** Card width bounds, in px — small phones bottom out, roomy ones stop growing. */
const MIN_W = 66;
const MAX_W = 82;
/** Distance between neighbouring cards in a row, as a fraction of a card's width. */
const STEP = 0.72;
/** Splay per card away from its row's centre, in degrees, and the arc's sag per card². */
const TILT = 3;
const DIP = 1.6;
/** Pivot of a card's tilt, as a fraction of its height below the top — keep in sync with `.tb-card`. */
const PIVOT = 1.3;
/** Clear space kept on each side of the tray. */
const SIDE = 6;
/** How far the fan sits left of centre, out from under the round button on the tray's right. */
const CTA_NUDGE = 30;
/**
 * Width the round button takes off the tray's right edge. A single row runs along
 * the tray's top, where the button sits, so it stops short of it; two rows only
 * put their shorter top row there, which the nudge already clears.
 */
const CTA_GUTTER = 92;
/**
 * Tightest a single row may pack, as a fraction of a card's width, to stay clear
 * of the button. Past that the row gives up the gutter and tucks its last cards
 * under the button instead — the corner it covers is empty, a sliver of a card is not.
 */
const MIN_CLEAR_STEP = 0.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface HandLayout {
  /** Card width in px. */
  w: number;
  /** Tray height in px when the hand needs two rows; null leaves the stylesheet's height. */
  trayH: number | null;
  /** Offset of card `i`'s top-left from the tray's centre column and top, plus its tilt. */
  place: (i: number) => { x: number; y: number; r: number };
}

export function handLayout(count: number, trayW: number, tableH: number): HandLayout {
  const w = Math.round(clamp((TRAY_SHARE * tableH - PAD) / (1.4 * (1 + REVEAL - BLEED)), MIN_W, MAX_W));
  const h = w * 1.4;
  const two = count >= TWO_ROWS_FROM;
  const bottom = two ? Math.ceil(count / 2) : count;
  const top = count - bottom;
  // Rows of equal length would stack card on card, so they lean apart to interlock.
  const equal = top === bottom;

  // The tilt throws a row's outermost top corner sideways by roughly the pivot's
  // distance times the sine of the angle; the row has to leave room for it.
  const swing = PIVOT * h * Math.sin((((bottom - 1) / 2) * TILT * Math.PI) / 180);
  const reach = (bottom - 1) + (equal ? 0.5 : 0);
  const fit = (gutter: number) =>
    reach > 0 ? Math.min(w * STEP, (trayW - gutter - SIDE - 2 * swing - w) / reach) : 0;
  let gutter = two ? SIDE : CTA_GUTTER;
  let step = fit(gutter);
  if (!two && step < w * MIN_CLEAR_STEP) {
    gutter = SIDE;
    step = fit(gutter);
  }
  const span = reach * step + w;
  const cx = clamp(trayW / 2 - CTA_NUDGE, span / 2 + SIDE + swing, trayW - gutter - swing - span / 2);

  const place = (i: number) => {
    const row = i < top ? 0 : 1;
    const m = row === 0 ? top : bottom;
    const o = (row === 0 ? i : i - top) - (m - 1) / 2;
    const lean = equal ? (row === 0 ? -step : step) / 4 : 0;
    return {
      x: cx + o * step + lean - w / 2 - trayW / 2,
      y: (row === 1 && two ? PAD + h * REVEAL : PAD) + o * o * DIP,
      r: o * TILT,
    };
  };

  return { w, trayH: two ? Math.round(PAD + h * (1 + REVEAL - BLEED)) : null, place };
}
