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
 * Run `act` with the feed sheet open on its Dev tab, then close the sheet again.
 *
 * On the felt table the dev controls (scenario select, seat switcher, player
 * count) are the "Dev" tab of the bottom sheet behind the HUD's feed button
 * (table/chrome/FeedSheet.tsx). The sheet is `inert` while closed, so nothing
 * in it can be selected or clicked until it is opened. `TableChrome` owns the
 * sheet outside the table, so it survives the table unmounting mid-swap.
 */
export async function withDevTab<T>(page: Page, act: () => Promise<T>): Promise<T> {
  const opener = page.getByRole('button', { name: 'Open table feed' });
  if ((await opener.getAttribute('aria-expanded')) !== 'true') await opener.click();
  await page.getByTestId('feed-tab-dev').click();
  try {
    return await act();
  } finally {
    await page.getByRole('button', { name: 'Collapse table feed' }).click();
  }
}

/**
 * Pick a /demo dev scenario and wait until the table shows the NEW room.
 *
 * /demo deals a brand-new server room per scenario over the network. Until
 * that response lands, the previous room's table (often the very same default
 * fixture) is still on screen, so "hand tray is visible" alone returns
 * immediately and the next step acts on a room that is about to be thrown
 * away. The swap unmounts the whole table (clientState goes null), so tagging
 * the current hand tray first and waiting for an untagged one is exact.
 */
export async function loadFixture(page: Page, name: string): Promise<void> {
  await tagCurrentHand(page);
  await withDevTab(page, () => page.getByLabel('Dev scenario').selectOption(name));
  await expect(page.locator(`[data-testid="hand-fan"]:not([${STALE}])`)).toBeVisible({ timeout: TABLE_TIMEOUT });
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
