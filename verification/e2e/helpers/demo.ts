import { expect, type Page } from '@playwright/test';

const STALE = 'data-e2e-stale-room';

/**
 * Pick a /demo dev scenario and wait until the board shows the NEW room.
 *
 * /demo deals a brand-new server room per scenario over the network. Until
 * that response lands, the previous room's board (often the very same default
 * fixture) is still on screen, so "hand fan is visible" alone returns
 * immediately and the next step acts on a room that is about to be thrown
 * away. The swap unmounts the whole board (clientState goes null), so tagging
 * the current hand fan first and waiting for an untagged one is exact.
 */
export async function loadFixture(page: Page, name: string): Promise<void> {
  // Let the initial mount's default-scenario load settle first, so the fan we
  // tag is the one the swap will replace (not one that mounts after tagging).
  await expect(page.getByTestId('hand-fan')).toBeVisible();
  await page.evaluate((attr) => {
    document.querySelector('[data-testid="hand-fan"]')?.setAttribute(attr, '');
  }, STALE);
  await page.getByLabel('Dev scenario').selectOption(name);
  await expect(page.locator(`[data-testid="hand-fan"]:not([${STALE}])`)).toBeVisible();
}

/**
 * Switch /demo's rendered seat (dev seat switcher; 0-based index) and wait for
 * that seat's board. A seat switch reconnects a different seat's SSE session
 * and remounts the board, the same way a scenario swap does.
 */
export async function switchSeat(page: Page, index: number): Promise<void> {
  await expect(page.getByTestId('hand-fan')).toBeVisible();
  await page.evaluate((attr) => {
    document.querySelector('[data-testid="hand-fan"]')?.setAttribute(attr, '');
  }, STALE);
  await page.locator(`[data-seat="${index}"]`).click();
  await expect(page.locator(`[data-seat="${index}"]`)).toHaveClass(/dev-controls__seat--active/);
  await expect(page.locator(`[data-testid="hand-fan"]:not([${STALE}])`)).toBeVisible();
}
