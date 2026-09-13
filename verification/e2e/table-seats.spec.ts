import { expect, test, type Page } from '@playwright/test';

/**
 * The table (OpponentSpotlight.tsx, the "C1 · Table seats" design from
 * /scratchpad) now fills rows 1+2 of the board on *every* turn, at every
 * viewport: every player — the viewer included — is a seat on the far rim, and
 * one of them is on the paper stage below. Whoever is acting takes the stage
 * at the start of each turn. An opponent's stage is their bank + sets; the
 * viewer's own stage is the table centre (draw pile, END TURN, discard pile)
 * and never their own board, which is the panel right underneath.
 *
 * This supersedes the rail + centre assertions in opponent-spotlight.spec.ts
 * ("shows the rail and table centre on the viewer's own turn" and the desktop
 * "replaces the rail" case) and the `opponent-card-*` inspect step in
 * card-aspect-ratio.spec.ts — there is no opponent rail any more.
 */

async function loadStandardMidGame(page: Page) {
  const openFeed = page.getByRole('button', { name: 'Open table feed' });
  if (await openFeed.isVisible().catch(() => false)) {
    await openFeed.click();
    await page.getByLabel('Dev scenario').selectOption('standardMidGame');
    // /demo deals a brand-new server room over the network for a fixture
    // switch (unlike the old /local pass-and-play's instant reprojection).
    await expect(page.getByTestId('hand-fan')).toBeVisible();
    await page.getByRole('button', { name: 'Collapse table feed' }).click();
  } else {
    await page.getByLabel('Dev scenario').selectOption('standardMidGame');
    await expect(page.getByTestId('hand-fan')).toBeVisible();
  }
}

async function boardNeverOverflows(page: Page, tolerance = 1) {
  return page.evaluate((tol) => {
    const board = document.querySelector('.game-board')!;
    return board.scrollHeight <= board.clientHeight + tol;
  }, tolerance);
}

test.describe('table seats (phone)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 659 });
    await page.goto('/demo');
    await expect(page.getByTestId('hand-fan')).toBeVisible();
    await loadStandardMidGame(page);
  });

  test('own turn: every player is a rim seat and the viewer\'s own stage is the table centre', async ({
    page,
  }) => {
    const rim = page.locator('.opponent-rim');
    await expect(rim).toBeVisible();
    // 4-seat fixture: the viewer + three opponents, all on the rim.
    await expect(rim.locator('.opponent-seat')).toHaveCount(4);
    await expect(page.getByTestId('table-seat-self')).toBeVisible();
    await expect(page.locator('[data-testid^="opponent-peer-"]')).toHaveCount(3);

    const stage = page.getByTestId('self-stage');
    await expect(stage).toBeVisible();
    await expect(stage.getByTestId('draw-pile')).toBeVisible();
    await expect(stage.getByTestId('discard-drop')).toBeVisible();
    await expect(stage.getByTestId('end-turn-btn')).toBeVisible();
    await expect(stage.locator('.opponent-spotlight__turn-tag')).toHaveText('TURN');
    // Never the viewer's own board: that's the properties panel below.
    await expect(stage.locator('.property-set-view')).toHaveCount(0);
    await expect(stage.locator('.cash-pile')).toHaveCount(0);
    await expect(page.getByTestId('opponent-spotlight')).toHaveCount(0);
    await expect(page.locator('.opponent-rail')).toHaveCount(0);

    expect(await boardNeverOverflows(page)).toBe(true);
  });

  test('opponent\'s turn: the acting opponent takes the stage with their bank and sets', async ({
    page,
  }) => {
    await page.getByTestId('end-turn-btn').click();

    const stage = page.getByTestId('opponent-spotlight');
    await expect(stage).toBeVisible();
    await expect(stage.locator('.opponent-spotlight__turn-tag')).toHaveText('TURN');
    await expect(stage.getByTestId('opponent-spotlight-sets')).toBeVisible();
    await expect(page.getByTestId('self-stage')).toHaveCount(0);
    await expect(page.getByTestId('draw-pile')).toHaveCount(0);

    // The rim marks the acting seat with the dealer button and the staged seat as pressed.
    const actingId = await stage.getAttribute('data-player-id');
    const actingSeat = page.getByTestId(`opponent-peer-${actingId}`);
    await expect(actingSeat).toHaveAttribute('aria-pressed', 'true');
    await expect(actingSeat.locator('.opponent-seat__dealer')).toBeVisible();

    expect(await boardNeverOverflows(page)).toBe(true);
  });

  test('tapping your own seat during an opponent\'s turn shows the discard pile, not your board', async ({
    page,
  }) => {
    await page.getByTestId('end-turn-btn').click();
    await expect(page.getByTestId('opponent-spotlight')).toBeVisible();

    await page.getByTestId('table-seat-self').click();

    const stage = page.getByTestId('self-stage');
    await expect(stage).toBeVisible();
    await expect(stage.getByTestId('discard-drop')).toBeVisible();
    await expect(stage.getByTestId('draw-pile')).toBeVisible();
    await expect(stage.getByTestId('turn-banner')).toContainText(/'s turn/);
    await expect(stage.getByTestId('end-turn-btn')).toHaveCount(0);
    await expect(stage.locator('.property-set-view')).toHaveCount(0);
    await expect(stage.locator('.cash-pile')).toHaveCount(0);
  });

  test('tapping the staged opponent\'s seat opens the read-only inspect modal', async ({ page }) => {
    await page.getByTestId('end-turn-btn').click();
    const stage = page.getByTestId('opponent-spotlight');
    await expect(stage).toBeVisible();
    const actingId = await stage.getAttribute('data-player-id');

    await page.getByTestId(`opponent-peer-${actingId}`).click();
    await expect(page.getByTestId('opponent-inspect-overlay')).toBeVisible();
  });

  test('the edge arrows walk the seats and a new turn takes the stage back', async ({ page }) => {
    await page.getByTestId('end-turn-btn').click();
    const stage = page.getByTestId('opponent-spotlight');
    await expect(stage).toBeVisible();
    const actingId = await stage.getAttribute('data-player-id');

    await page.getByRole('button', { name: 'Next seat' }).click();
    await expect(page.locator('[data-player-id]').first()).not.toHaveAttribute('data-player-id', actingId!);

    // Pass-and-play: switching to the acting seat and ending their turn starts a new turn.
    await page.keyboard.press('2');
    await page.getByTestId('end-turn-btn').click();
    const next = page.locator('.opponent-spotlight__stage');
    await expect(next.locator('.opponent-spotlight__turn-tag')).toHaveText('TURN');
  });

  test('a five-player table seats all five', async ({ page }) => {
    await page.goto('/demo?players=5');
    await expect(page.getByTestId('hand-fan')).toBeVisible();

    await expect(page.locator('.opponent-rim .opponent-seat')).toHaveCount(5);
    await expect(page.locator('[data-testid^="opponent-peer-"]')).toHaveCount(4);
    await expect(page.getByTestId('table-seat-self')).toBeVisible();

    // Every seat sits clear of the fixed Feed FAB and sound toggle in the top-right corner.
    const fab = await page.getByRole('button', { name: 'Open table feed' }).boundingBox();
    const seats = await page.locator('.opponent-rim .opponent-seat').all();
    for (const seat of seats) {
      const box = await seat.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(fab!.x - 28);
    }
    expect(await boardNeverOverflows(page)).toBe(true);
  });
});

test.describe('table seats (desktop, 1280x900)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/demo');
    await expect(page.getByTestId('hand-fan')).toBeVisible();
    await loadStandardMidGame(page);
  });

  test('the same table on the viewer\'s own turn and on an opponent\'s', async ({ page }) => {
    await expect(page.locator('.opponent-rim .opponent-seat')).toHaveCount(4);
    await expect(page.getByTestId('self-stage').getByTestId('end-turn-btn')).toBeVisible();
    await expect(page.locator('.opponent-rail')).toHaveCount(0);

    await page.getByTestId('end-turn-btn').click();
    await expect(page.getByTestId('opponent-spotlight')).toBeVisible();
    await expect(page.getByTestId('draw-pile')).toHaveCount(0);

    const panels = await page.getByTestId('properties-drop').boundingBox();
    const hand = await page.getByTestId('hand-fan').boundingBox();
    expect(panels?.height ?? 0).toBeGreaterThanOrEqual(100);
    expect(hand?.height ?? 0).toBeGreaterThan(0);
    expect(await boardNeverOverflows(page, 6)).toBe(true);
  });
});
