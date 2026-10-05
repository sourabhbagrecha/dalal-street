import { expect, test, type Page } from '@playwright/test';
import { openDemo, settleCamera, switchSeat } from './helpers/demo';

/**
 * Your seat with the camera on it (table/felt/layout.ts, mineLayout) when many sets pile up: past two rows the cards
 * shrink (never below the 64px card floor) instead of the panel swallowing the screen, and it never fills more than
 * 80% of the view, so bare table stays above and below it to tap and zoom out. Runs on the /demo
 * `tenIncompleteSets` fixture: ten sets and a bank on your seat.
 */

test.use({ viewport: { width: 430, height: 860 } });

/** Wait for the camera to sit on your seat, then measure the seat against it. */
async function measureSeat(page: Page) {
  await expect(page.locator('.tb-cam')).toHaveAttribute('data-cam', 'me');
  // The camera and the panel settle together.
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const seat = document.querySelector('.tb-mine')!;
    const cam = document.querySelector('.tb-cam')!.getBoundingClientRect();
    const r = seat.getBoundingClientRect();
    return {
      fill: r.height / cam.height,
      gapTop: r.top - cam.top,
      gapBottom: cam.bottom - r.bottom,
      cardW: seat.querySelector('.playing-card')!.getBoundingClientRect().width,
    };
  });
}

test.describe('crowded rival glance panel (phone)', () => {
  test('ten sets cap the far panel at three rows, "+N" for the rest, so it never reaches the seat below it', async ({ page }) => {
    await openDemo(page, 'tenIncompleteSets');
    await switchSeat(page, 1);
    await settleCamera(page);
    // The panel is screen-sized and hangs from its seat's top edge; the seat's own rect is the room it has before the next seat starts.
    for (const size of [{ width: 360, height: 640 }, { width: 393, height: 852 }, { width: 430, height: 860 }]) {
      await page.setViewportSize(size);
      await settleCamera(page);
      const glance = await page.evaluate(() => {
        const zone = document.querySelector('.tb-zone[data-seat="p1"]')!.getBoundingClientRect();
        const panel = document.querySelector('.tb-zone[data-seat="p1"] .tb-glance')!;
        return { room: zone.height, h: panel.getBoundingClientRect().height, tiles: panel.querySelectorAll('.tb-tok').length, more: panel.querySelector('.tb-tok--more')?.textContent };
      });
      const at = `at ${size.width}x${size.height}`;
      expect(glance.tiles, `tiles ${at}`).toBe(6);
      expect(glance.more, `overflow tile ${at}`).toBe('+5');
      expect(glance.h, `panel height within its seat ${at}`).toBeLessThanOrEqual(glance.room);
    }
  });
});

test.describe('crowded own seat (phone)', () => {
  test('ten sets stop at the card floor, never fill the view, and a tap on the bare table above or below zooms out', async ({
    page,
  }) => {
    await openDemo(page, 'tenIncompleteSets');
    await page.locator('.tb-mine .tb-set').first().waitFor();

    const seat = await measureSeat(page);
    expect(seat.cardW).toBeGreaterThanOrEqual(64);
    expect(seat.fill).toBeLessThanOrEqual(0.81);
    expect(seat.gapTop).toBeGreaterThan(50);
    expect(seat.gapBottom).toBeGreaterThan(50);

    for (const where of ['top', 'bottom'] as const) {
      if (where === 'bottom') {
        // Back onto your seat before probing the other gap.
        await page.getByTestId('table-seat-self').click();
        expect((await measureSeat(page)).gapBottom).toBeGreaterThan(50);
      }
      // Rival seats sit on the rim, so probe the gap for a spot with nothing on it.
      const spot = await page.evaluate((side) => {
        const cam = document.querySelector('.tb-cam')!.getBoundingClientRect();
        const mine = document.querySelector('.tb-mine')!.getBoundingClientRect();
        const [from, to] = side === 'top' ? [cam.top + 4, mine.top - 4] : [mine.bottom + 4, cam.bottom - 4];
        for (let y = from; y < to; y += 8) {
          for (let x = 8; x < cam.width - 8; x += 8) {
            const hit = document.elementFromPoint(x, y);
            if (hit && !hit.closest('button, .tb-mine, .tb-zone, .tb-loupe, .tb-banner')) return { x, y };
          }
        }
        return null;
      }, where);
      expect(spot, `bare table ${where}`).not.toBeNull();
      await page.mouse.click(spot!.x, spot!.y);
      await expect(page.locator('.tb-cam')).toHaveAttribute('data-cam', 'table');
    }

    // The same ten sets seen from another seat, as a rival's panel (focusLayout): up to three whole rows; past that the
    // rest scrolls inside the panel, the next row's top peeking out under the third, instead of spilling out of it over
    // the switcher and the hand. Three rows at 430 wide; four at 393, so there it scrolls.
    await switchSeat(page, 1);
    await page.locator('.tb-zone[data-seat="p1"]').click();
    const spot = page.getByTestId('opponent-spotlight');
    await expect(spot).toHaveAttribute('data-player-id', 'p1');
    await page.waitForTimeout(900);
    for (const { scrolls, ...size } of [
      { width: 430, height: 860, scrolls: false },
      { width: 393, height: 852, scrolls: true },
    ]) {
      await page.setViewportSize(size);
      await settleCamera(page);
      const rival = await page.evaluate(() => {
        const panel = document.querySelector('[data-testid="opponent-spotlight"]')!;
        const body = panel.querySelector<HTMLElement>('.tb-zone__body')!;
        body.scrollTop = 0;
        const p = panel.getBoundingClientRect();
        const b = body.getBoundingClientRect();
        const tiles = [...body.querySelectorAll('.tb-set')].map((t) => t.getBoundingClientRect());
        const whole = new Set(tiles.filter((t) => t.bottom <= b.bottom + 1).map((t) => Math.round(t.top))).size;
        const peeking = tiles.filter((t) => t.top < b.bottom && t.bottom > b.bottom + 1);
        body.scrollTop = body.scrollHeight;
        const last = body.querySelector('.tb-set:last-child')!.getBoundingClientRect();
        return {
          inside: b.bottom <= p.bottom + 1,
          whole,
          peek: peeking.length ? b.bottom - Math.min(...peeking.map((t) => t.top)) : 0,
          scrolls: body.scrollHeight > body.clientHeight + 1,
          lastReachable: last.bottom <= b.bottom + 1,
          cardW: body.querySelector('.playing-card')!.getBoundingClientRect().width,
          more: body.dataset.more,
        };
      });
      const at = `at ${size.width}x${size.height}`;
      expect(rival.inside, `body inside panel ${at}`).toBe(true);
      expect(rival.whole, `whole rows shown ${at}`).toBe(3);
      expect(rival.scrolls, `scrolls ${at}`).toBe(scrolls);
      expect(rival.lastReachable, `last set reachable ${at}`).toBe(true);
      expect(rival.cardW).toBeGreaterThanOrEqual(62);
      if (scrolls) {
        expect(rival.peek, `next row peeks out ${at}`).toBeGreaterThan(10);
        expect(rival.more).toBe('down');
      }
    }
  });
});
