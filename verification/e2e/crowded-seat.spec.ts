import { expect, test, type Page } from '@playwright/test';
import { openDemo } from './helpers/demo';

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
  });
});
