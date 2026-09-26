/**
 * Where each card of the hand sits in the table's tray.
 *
 * Up to seven cards fan in one row. From eight up they split into two rows — the
 * bottom one, nearest the thumb, never shorter than the top — so a full nine-card
 * hand is 4 over 5 and every card keeps most of its width on show instead of a
 * sliver. Each lower row rides up over the one above by REVEAL of a card's height,
 * and the tray grows to hold them.
 *
 * While the hand-limit discard is up, the hand is the only thing to look at: the
 * tray takes about half the table and the cards fan three rows deep, so each
 * one is big and far enough from its neighbours to read and tap.
 */

/** Hand size at which the single row splits in two. */
const TWO_ROWS_FROM = 8;

/** Room above the top row, so a card tilted at the row's end keeps its corner. */
const PAD = 18;
/** How far the bottom row starts below the top one, as a fraction of a card's height. */
const REVEAL = 0.6;
/** How much of the bottom row hangs off the tray's lower edge, as a fraction of a card's height. */
const BLEED = 0.1;
/** Share of the table's height the tray is sized to take. */
const TRAY_SHARE = 0.27;
/** Card width bounds, in px — small phones bottom out, roomy ones stop growing. */
const MIN_W = 72;
const MAX_W = 92;
/** The same three, for the discard. */
const BIG_SHARE = 0.46;
const BIG_MIN_W = 84;
const BIG_MAX_W = 124;
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

interface HandLayout {
  /** Card width in px. */
  w: number;
  /** Tray height in px when the hand needs more than one row or is shown big; null leaves the stylesheet's height. */
  trayH: number | null;
  /** Offset of card `i`'s top-left from the tray's centre column and top, plus its tilt. */
  place: (i: number) => { x: number; y: number; r: number };
}

/** How many cards sit in each row, top first; lower rows are never shorter. */
function rowSizes(count: number, rows: number): number[] {
  const base = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, r) => base + (r >= rows - extra ? 1 : 0));
}

export function handLayout(count: number, trayW: number, tableH: number, big = false): HandLayout {
  const two = count >= TWO_ROWS_FROM;
  const rows = big ? (two ? 3 : count >= 4 ? 2 : 1) : two ? 2 : 1;
  // Sized as if two rows deep in the plain tray, so a hand does not shrink as it splits.
  const deep = big ? rows - 1 : 1;
  const w = Math.round(
    clamp(
      ((big ? BIG_SHARE : TRAY_SHARE) * tableH - PAD) / (1.4 * (1 + deep * REVEAL - BLEED)),
      big ? BIG_MIN_W : MIN_W,
      big ? BIG_MAX_W : MAX_W,
    ),
  );
  const h = w * 1.4;
  const sizes = rowSizes(count, rows);
  const bottom = sizes[rows - 1] ?? 0;
  // Rows of equal length would stack card on card, so they lean apart to interlock.
  const equal = (r: number) => sizes[r] === sizes[r - 1] || sizes[r] === sizes[r + 1];

  // The tilt throws a row's outermost top corner sideways by roughly the pivot's
  // distance times the sine of the angle; the row has to leave room for it.
  const swing = PIVOT * h * Math.sin((((bottom - 1) / 2) * TILT * Math.PI) / 180);
  const reach = (bottom - 1) + (rows > 1 && equal(rows - 1) ? 0.5 : 0);
  const fit = (gutter: number) =>
    reach > 0 ? Math.min(w * STEP, (trayW - gutter - SIDE - 2 * swing - w) / reach) : 0;
  let gutter = rows > 1 ? SIDE : CTA_GUTTER;
  let step = fit(gutter);
  if (rows === 1 && step < w * MIN_CLEAR_STEP) {
    gutter = SIDE;
    step = fit(gutter);
  }
  const span = reach * step + w;
  const cx = clamp(trayW / 2 - CTA_NUDGE, span / 2 + SIDE + swing, trayW - gutter - swing - span / 2);
  const leanOf = (row: number) => (rows > 1 && equal(row) ? ((rows - 1 - row) % 2 ? -step : step) / 4 : 0);

  // The top row runs along the tray's top edge, under the round button. When it is as
  // long as the rows below, the nudge is not enough: it slides left, as far as the edge lets it.
  const top = sizes[0] ?? 0;
  const topSwing = PIVOT * h * Math.sin((((top - 1) / 2) * TILT * Math.PI) / 180);
  const topHalf = ((top - 1) / 2) * step + w / 2 + topSwing;
  const topMid = cx + leanOf(0);
  const topShift = rows > 1 ? Math.min(0, Math.max(SIDE + topHalf, trayW - CTA_GUTTER - topHalf) - topMid) : 0;

  const place = (i: number) => {
    let row = 0;
    let first = 0;
    while (row < rows - 1 && i >= first + (sizes[row] ?? 0)) first += sizes[row++] ?? 0;
    const m = sizes[row] ?? 1;
    const o = i - first - (m - 1) / 2;
    return {
      x: cx + o * step + leanOf(row) + (row === 0 ? topShift : 0) - w / 2 - trayW / 2,
      y: PAD + row * h * REVEAL + o * o * DIP,
      r: o * TILT,
    };
  };

  return {
    w,
    trayH: rows > 1 || big ? Math.round(PAD + h * (1 + (rows - 1) * REVEAL - BLEED)) : null,
    place,
  };
}
