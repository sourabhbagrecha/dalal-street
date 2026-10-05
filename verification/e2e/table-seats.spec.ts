import { expect, test, type Page } from '@playwright/test';
import { expectControlsInViewport, openDemo, settleCamera, switchSeat, tableNeverScrolls } from './helpers/demo';

/**
 * The felt table (table/TableScreen.tsx): every rival is a seat on the felt,
 * the viewer's own seat is the panel at the bottom of it, and a camera frames
 * whatever matters — the viewer on their own turn, the acting rival on theirs.
 * A tap on a seat zooms in on it; while zoomed, the rivals become the tabs of
 * a switcher under the camera. This spec locks in that shape at every
 * viewport: who is on the table, where the camera goes at each turn, and that
 * nothing ever has to scroll to reach the HUD, the tray or its round button.
 *
 * Card-ratio/clip correctness for the cards on a zoomed seat lives in
 * card-aspect-ratio.spec.ts instead, so its webkit project covers them too.
 */

/** Every rival seat and the viewer's own seat lie inside the camera's frame. */
async function everySeatInFrame(page: Page) {
  await settleCamera(page);
  const cam = (await page.locator('.tb-cam').boundingBox())!;
  const seats = await page.locator('.tb-zone, .tb-mine').all();
  expect(seats.length).toBeGreaterThan(0);
  for (const seat of seats) {
    const box = (await seat.boundingBox())!;
    expect(box.x, 'seat left edge inside the camera').toBeGreaterThanOrEqual(cam.x - 1);
    expect(box.x + box.width, 'seat right edge inside the camera').toBeLessThanOrEqual(cam.x + cam.width + 1);
    expect(box.y, 'seat top edge inside the camera').toBeGreaterThanOrEqual(cam.y - 1);
    expect(box.y + box.height, 'seat bottom edge inside the camera').toBeLessThanOrEqual(cam.y + cam.height + 1);
  }
}

test.describe('table seats (phone)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 659 });
    await openDemo(page, 'standardMidGame');
  });

  test('own turn puts the camera on you with END TURN; on a rival\'s turn it follows them, and a tap on your seat brings it back', async ({
    page,
  }) => {
    // 4-seat fixture: the viewer + three rival seats on the felt.
    await expect(page.locator('[data-testid^="opponent-peer-"]')).toHaveCount(3);
    await expect(page.getByTestId('self-stage')).toBeVisible();
    await expect(page.getByTestId('table-seat-self')).toBeVisible();
    await expect(page.locator('.tb-cam')).toHaveAttribute('data-cam', 'me');
    await expect(page.getByTestId('opponent-spotlight')).toHaveCount(0);

    // The HUD names the viewer's own seat as the acting one; END TURN is theirs.
    const me = await page.getByTestId('self-stage').getAttribute('data-seat');
    await expect(page.getByTestId('turn-banner')).toHaveAttribute('data-turn-id', me!);
    await expect(page.getByTestId('end-turn-btn')).toBeVisible();
    // The table centre (deck + discard) is one place, on the felt, whoever is acting.
    await expect(page.getByTestId('draw-pile')).toHaveCount(1);
    await expect(page.getByTestId('discard-drop')).toHaveCount(1);

    expect(await tableNeverScrolls(page)).toBe(true);
    await expectControlsInViewport(page);

    // Opponent's turn: the camera follows the acting rival onto their seat.
    await page.getByTestId('end-turn-btn').click();

    const stage = page.getByTestId('opponent-spotlight');
    await expect(stage).toBeVisible();
    await expect(page.locator('.tb-cam')).toHaveAttribute('data-cam', 'seat');
    const actingId = await page.getByTestId('turn-banner').getAttribute('data-turn-id');
    await expect(stage).toHaveAttribute('data-player-id', actingId!);
    await expect(stage).toHaveAttribute('data-turn', 'true');
    // Zoomed in, the rival's seat lays out their bank and sets like the viewer's own.
    await expect(stage.getByTestId('opponent-spotlight-sets')).toBeVisible();

    // The switcher under the camera lists every rival, with the staged one pressed.
    const tabs = page.locator('.tb-seats [data-testid^="opponent-peer-"]');
    await expect(tabs).toHaveCount(3);
    await expect(page.locator('.tb-seats').getByTestId(`opponent-peer-${actingId}`)).toHaveAttribute('aria-pressed', 'true');

    // Not the viewer's turn: no END TURN, but their own seat is still on the table.
    await expect(page.getByTestId('end-turn-btn')).toHaveCount(0);
    await expect(page.getByTestId('self-stage')).toHaveCount(1);

    await settleCamera(page);
    expect(await tableNeverScrolls(page)).toBe(true);
    await expectControlsInViewport(page);

    // Tapping your own seat during an opponent's turn brings the camera to you, without END TURN.
    await page.getByTestId('table-seat-self').click();

    await expect(page.locator('.tb-cam')).toHaveAttribute('data-cam', 'me');
    await expect(page.getByTestId('self-stage')).toHaveAttribute('data-focus', 'true');
    // Still Priya's turn (in /demo only the viewer's seat is connected, so she reads as away).
    await expect(page.getByTestId('turn-banner')).toHaveAttribute('data-turn-id', 'p2');
    await expect(page.getByTestId('turn-banner')).toContainText(/Priya is (playing|away)/);
    await expect(page.getByTestId('end-turn-btn')).toHaveCount(0);
  });

  test('the switcher walks the rivals, the whole-table button zooms out, and a new turn takes the camera back', async ({
    page,
  }) => {
    await page.getByTestId('end-turn-btn').click();
    const stage = page.getByTestId('opponent-spotlight');
    await expect(stage).toBeVisible();
    const actingId = await stage.getAttribute('data-player-id');

    // Another rival's tab: the camera moves to that seat.
    const other = page.locator(`.tb-seats [data-testid^="opponent-peer-"]:not([data-testid="opponent-peer-${actingId}"])`).first();
    const otherId = (await other.getAttribute('data-testid'))!.replace('opponent-peer-', '');
    await other.click();
    await expect(page.getByTestId('opponent-spotlight')).toHaveAttribute('data-player-id', otherId);

    // Back out to the whole table: every rival is a seat again, none staged, all in frame.
    await page.getByRole('button', { name: 'Back to the whole table' }).click();
    await expect(page.locator('.tb-cam')).toHaveAttribute('data-cam', 'table');
    await expect(page.getByTestId('opponent-spotlight')).toHaveCount(0);
    await expect(page.locator('[data-testid^="opponent-peer-"]')).toHaveCount(3);
    await everySeatInFrame(page);

    // Pass-and-play: switching to the acting seat and ending their turn starts a
    // new turn, and the camera follows the next actor by itself.
    await switchSeat(page, 1);
    await page.getByTestId('end-turn-btn').click();
    const next = page.getByTestId('opponent-spotlight');
    await expect(next).toBeVisible();
    await expect(next).toHaveAttribute('data-player-id', 'p3');
    await expect(next).toHaveAttribute('data-turn', 'true');
  });

  test("the zoom toggle keeps the whole table through a rival's turn; your own turn still comes to you", async ({ page }) => {
    const cam = page.locator('.tb-cam');
    // The switch lives in the HUD menu, which stays open after a flip like its other switches; Escape closes it.
    const zoom = page.getByRole('switch', { name: 'Stay zoomed out' });
    const toggleZoom = async () => {
      await page.getByTestId('menu-button').click();
      await zoom.click();
      await page.keyboard.press('Escape');
      await expect(zoom).toHaveCount(0);
    };
    const expectZoom = async (on: boolean) => {
      await page.getByTestId('menu-button').click();
      await expect(zoom).toHaveAttribute('aria-checked', String(on));
      await page.keyboard.press('Escape');
      await expect(zoom).toHaveCount(0);
    };
    await expectZoom(false);

    // Zoomed out on your own turn: the whole table, at once.
    await toggleZoom();
    await expectZoom(true);
    await expect(cam).toHaveAttribute('data-cam', 'table');

    // A rival's turn: the camera stays out and no seat is staged.
    await page.getByTestId('end-turn-btn').click();
    await expect(page.getByTestId('turn-banner')).toHaveAttribute('data-turn-id', 'p2');
    await settleCamera(page);
    await expect(cam).toHaveAttribute('data-cam', 'table');
    await expect(page.getByTestId('opponent-spotlight')).toHaveCount(0);

    // Pass-and-play onto the acting seat: now it is the viewer's own turn, and the camera comes in to them.
    await switchSeat(page, 1);
    await expect(cam).toHaveAttribute('data-cam', /^(me|centre)$/);

    // Zoomed back in, the next rival's turn is followed onto their seat again.
    await toggleZoom();
    await expectZoom(false);
    await page.getByTestId('end-turn-btn').click();
    await expect(page.getByTestId('opponent-spotlight')).toHaveAttribute('data-player-id', 'p3');
  });
});

test.describe('table seats (phone, five players)', () => {
  test('a five-player table seats all five', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 659 });
    await page.goto('/demo?players=5');
    await expect(page.getByTestId('hand-fan')).toBeVisible({ timeout: 15_000 });

    await expect(page.locator('[data-testid^="opponent-peer-"]')).toHaveCount(4);
    await expect(page.getByTestId('self-stage')).toBeVisible();
    await expect(page.getByTestId('table-seat-self')).toBeVisible();

    // Zoomed out, every seat — all four rivals and the viewer — fits the camera's frame.
    await page.getByTestId('menu-button').click();
    await page.getByRole('switch', { name: 'Stay zoomed out' }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.tb-cam')).toHaveAttribute('data-cam', 'table');
    await everySeatInFrame(page);
    expect(await tableNeverScrolls(page)).toBe(true);
    await expectControlsInViewport(page);
  });
});

test.describe('table seats (landscape phone)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 852, height: 393 });
    await openDemo(page, 'standardMidGame');
  });

  test('sideways, the hand tray and END TURN stay reachable and nothing scrolls', async ({ page }) => {
    await expect(page.locator('[data-testid^="opponent-peer-"]')).toHaveCount(3);
    await expect(page.getByTestId('end-turn-btn')).toBeVisible();
    expect(await tableNeverScrolls(page)).toBe(true);
    await expectControlsInViewport(page);
  });
});

test.describe('table seats (desktop, 1280x900)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openDemo(page, 'standardMidGame');
  });

  test("the same table on the viewer's own turn and on an opponent's", async ({ page }) => {
    await expect(page.locator('[data-testid^="opponent-peer-"]')).toHaveCount(3);
    await expect(page.getByTestId('end-turn-btn')).toBeVisible();
    await expect(page.locator('.tb-cam')).toHaveAttribute('data-cam', 'me');
    await expectControlsInViewport(page);

    await page.getByTestId('end-turn-btn').click();
    await expect(page.getByTestId('opponent-spotlight')).toBeVisible();
    await expect(page.locator('.tb-cam')).toHaveAttribute('data-cam', 'seat');
    await expect(page.getByTestId('end-turn-btn')).toHaveCount(0);

    await settleCamera(page);
    expect(await tableNeverScrolls(page)).toBe(true);
    await expectControlsInViewport(page);
  });
});
