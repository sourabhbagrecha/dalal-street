import { expect, test, type Page } from '@playwright/test';

/**
 * Your seat with the camera on it (TableScreen.tsx, mineLayout) when many sets pile up: past two rows the cards
 * shrink (never below the 64px card floor) instead of the panel swallowing the screen, and it never fills more than
 * 80% of the view, so bare table stays above and below it to tap and zoom out. Runs on the /scratchpad mock table,
 * where `?mine=N` piles N sets on your seat.
 */

test.use({ viewport: { width: 430, height: 860 } });

async function seatAt(page: Page, mine: number) {
  await page.goto(`/scratchpad?mine=${mine}&rivals=2`);
  await page.locator('.tb-mine .tb-set').first().waitFor();
  await expect(page.locator('.tb-cam')).toHaveAttribute('data-cam', 'me');
  // The camera and the panel settle together.
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const seat = document.querySelector('.tb-mine')!;
    const cam = document.querySelector('.tb-cam')!.getBoundingClientRect();
    const r = seat.getBoundingClientRect();
    const tiles = [...seat.querySelectorAll('.tb-set')].map((s) => s.getBoundingClientRect());
    return {
      fill: r.height / cam.height,
      gapTop: r.top - cam.top,
      gapBottom: cam.bottom - r.bottom,
      cardW: seat.querySelector('.playing-card')!.getBoundingClientRect().width,
      rows: new Set(tiles.map((t) => Math.round(t.top / 20))).size,
      scroll: (seat as HTMLElement).dataset.scroll === 'true',
    };
  });
}

test.describe('crowded own seat (phone)', () => {
  test('six sets and the bank shrink into two rows, leaving table to tap', async ({ page }) => {
    const seat = await seatAt(page, 6);
    expect(seat.rows).toBe(2);
    expect(seat.cardW).toBeGreaterThanOrEqual(64);
    expect(seat.fill).toBeLessThan(0.8);
    expect(seat.gapTop).toBeGreaterThan(60);
    expect(seat.scroll).toBe(false);
  });

  for (const mine of [8, 12]) {
    test(`${mine} sets stop at the card floor and never fill the view`, async ({ page }) => {
      const seat = await seatAt(page, mine);
      expect(seat.cardW).toBeGreaterThanOrEqual(64);
      expect(seat.cardW).toBeLessThan(70);
      expect(seat.fill).toBeLessThanOrEqual(0.81);
      expect(seat.gapTop).toBeGreaterThan(50);
      expect(seat.gapBottom).toBeGreaterThan(50);
    });
  }

  test('a tap on the bare table above or below the seat zooms out', async ({ page }) => {
    for (const where of ['top', 'bottom'] as const) {
      const seat = await seatAt(page, 8);
      expect(seat.gapTop).toBeGreaterThan(50);
      const cam = (await page.locator('.tb-cam').boundingBox())!;
      const y = where === 'top' ? cam.y + 60 : cam.y + cam.height - 20;
      await page.mouse.click(30, y);
      await expect(page.locator('.tb-cam')).toHaveAttribute('data-cam', 'table');
    }
  });
});
