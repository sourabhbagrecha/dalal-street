import { describe, expect, it } from 'vitest';
import { handLayout } from './handLayout';

/**
 * The round END TURN button is a fixed 80x80px disc pinned to the tray's top-right
 * (`.tb-cta`: right 10px, top -34px — see gl-table.css). A hand fanned in one row must
 * keep its cards clear of that disc; on a narrow phone a handful of cards at the tray's
 * usual width can't do that on their own (a playtest report caught the button sitting on
 * top of the last hand card at 360x640), so handLayout splits them into two rows instead.
 */
/** The button's box relative to a tray of the given width, per gl-table.css's `.tb-cta`. */
function ctaBox(trayW: number) {
  return { left: trayW - 10 - 80, right: trayW - 10, top: -34, bottom: -34 + 80 };
}

/** Every card's on-screen box (top-left at the tray's centre column, per `place`). */
function boxes(fan: ReturnType<typeof handLayout>, count: number, trayW: number) {
  return Array.from({ length: count }, (_, i) => {
    const at = fan.place(i);
    const left = trayW / 2 + at.x;
    return { left, right: left + fan.w, top: at.y, bottom: at.y + fan.w * 1.4 };
  });
}

function overlapsCta(box: { left: number; right: number; top: number; bottom: number }, trayW: number): boolean {
  const cta = ctaBox(trayW);
  return box.left < cta.right && box.right > cta.left && box.top < cta.bottom && box.bottom > cta.top;
}

describe('handLayout — the round button never covers a hand card', () => {
  it('a 7-card hand on a 360px-wide tray splits into two rows, clear of the button', () => {
    const trayW = 360;
    const fan = handLayout(7, trayW, 640);
    expect(fan.trayH).not.toBeNull(); // two rows: the tray grows to hold them
    const cards = boxes(fan, 7, trayW);
    for (const [i, box] of cards.entries()) {
      expect(overlapsCta(box, trayW), `card ${i} overlaps the END TURN button`).toBe(false);
    }
  });

  it('the same 7-card hand on a roomy tablet tray still clears the button', () => {
    const trayW = 700;
    const fan = handLayout(7, trayW, 900);
    const cards = boxes(fan, 7, trayW);
    for (const [i, box] of cards.entries()) {
      expect(overlapsCta(box, trayW), `card ${i} overlaps the END TURN button`).toBe(false);
    }
  });

  it('a small hand that already clears the button on a narrow tray stays one row', () => {
    const trayW = 360;
    const fan = handLayout(4, trayW, 640);
    // One row: the tray keeps the stylesheet's own height (see handLayout's trayH doc).
    expect(fan.trayH).toBeNull();
    const cards = boxes(fan, 4, trayW);
    for (const [i, box] of cards.entries()) {
      expect(overlapsCta(box, trayW), `card ${i} overlaps the END TURN button`).toBe(false);
    }
  });

  it('a hand past TWO_ROWS_FROM still splits regardless of width', () => {
    const fan = handLayout(9, 700, 900);
    expect(fan.trayH).not.toBeNull();
  });
});
