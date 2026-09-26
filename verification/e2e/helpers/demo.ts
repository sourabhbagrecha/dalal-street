import { expect, type Page } from '@playwright/test';

const STALE = 'data-e2e-stale-room';

/** /demo deals a real server room on load and on every swap; the first table can take a few seconds to arrive. */
const TABLE_TIMEOUT = 15_000;

/** Tag the hand tray on screen now, so a later wait can tell the next room's tray from this one. */
async function tagCurrentHand(page: Page): Promise<void> {
  // Let the initial mount's default-scenario load settle first, so the tray we
  // tag is the one the swap will replace (not one that mounts after tagging).
  await expect(page.getByTestId('hand-fan')).toBeVisible({ timeout: TABLE_TIMEOUT });
  await page.evaluate((attr) => {
    document.querySelector('[data-testid="hand-fan"]')?.setAttribute(attr, '');
  }, STALE);
}

/**
 * Open /demo straight on a scenario (`?fixture=`): one room dealt, no dev-sheet
 * round trip. Each test starts its own table this way rather than swapping
 * scenarios mid-test.
 */
export async function openDemo(page: Page, fixture: string): Promise<void> {
  await page.goto(`/demo?fixture=${fixture}`);
  await expect(page.getByTestId('hand-fan')).toBeVisible({ timeout: TABLE_TIMEOUT });
}

/**
 * Switch /demo's rendered seat (0-based index) and wait for that seat's table.
 * Uses the keyboard shortcut DemoGameApp wires up (keys 1..N -> seat index-1),
 * which works with the sheet closed. A seat switch reconnects a different
 * seat's SSE session and remounts the table, the same way a scenario swap does.
 */
export async function switchSeat(page: Page, index: number): Promise<void> {
  await tagCurrentHand(page);
  await page.keyboard.press(String(index + 1));
  await expect(page.locator(`.dev-controls [data-seat="${index}"]`)).toHaveClass(/dev-controls__seat--active/);
  await expect(page.locator(`[data-testid="hand-fan"]:not([${STALE}])`)).toBeVisible({ timeout: TABLE_TIMEOUT });
}

/** Wait for the camera's 0.5s swoop to finish: the world's transform stops changing. */
export async function settleCamera(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const world = document.querySelector('.tb-world');
    if (!world) throw new Error('no .tb-world on screen');
    const read = () => getComputedStyle(world).transform;
    let last = read();
    let still = 0;
    for (let i = 0; i < 40 && still < 2; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const now = read();
      still = now === last ? still + 1 : 0;
      last = now;
    }
  });
}

/**
 * The table never asks the player to scroll: its frame (`.tb`) clips instead of
 * scrolling (a drag gesture would fight a scroll), and the document itself is
 * never taller or wider than the viewport. The frame's scrollHeight is not the
 * measure here — the closed feed sheet is parked just below it by design.
 */
export async function tableNeverScrolls(page: Page, tolerance = 1): Promise<boolean> {
  return page.evaluate((tol) => {
    const tb = document.querySelector('.tb');
    if (!tb) throw new Error('no .tb table frame on screen');
    const frameClips = getComputedStyle(tb).overflow === 'hidden';
    const doc = document.scrollingElement ?? document.documentElement;
    const pageFits = doc.scrollHeight <= window.innerHeight + tol && doc.scrollWidth <= window.innerWidth + tol;
    return frameClips && pageFits;
  }, tolerance);
}

/** The controls a turn needs — the HUD line, the hand tray and its round button — all sit inside the viewport. */
export async function expectControlsInViewport(page: Page): Promise<void> {
  const vp = page.viewportSize()!;
  for (const testId of ['turn-banner', 'hand-fan']) {
    const box = (await page.getByTestId(testId).boundingBox())!;
    expect(box, `${testId} has a box`).toBeTruthy();
    expect(box.y, `${testId} top inside the viewport`).toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height, `${testId} bottom inside the viewport`).toBeLessThanOrEqual(vp.height + 1);
    expect(box.x, `${testId} left inside the viewport`).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, `${testId} right inside the viewport`).toBeLessThanOrEqual(vp.width + 1);
  }
  const cta = (await page.locator('.tb-cta').boundingBox())!;
  expect(cta, 'the round button has a box').toBeTruthy();
  expect(cta.y + cta.height, 'the round button is inside the viewport').toBeLessThanOrEqual(vp.height + 1);
  expect(cta.x + cta.width, 'the round button is inside the viewport').toBeLessThanOrEqual(vp.width + 1);
}
