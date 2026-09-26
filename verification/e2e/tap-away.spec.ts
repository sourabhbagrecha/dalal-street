import { expect, test } from '@playwright/test';
import { openDemo } from './helpers/demo';

/**
 * A picked card is never a trap: a tap anywhere else puts it back down. The hand, the pills and the flippable wilds
 * on your own table answer for themselves; a tap on bare table that only put a card down does not also move the camera.
 */
test.describe('tapping away puts a picked card down', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
  });

  test('a hand card', async ({ page }) => {
    // standardMidGame: Aarav holds Pass Go (pg1).
    await openDemo(page, 'standardMidGame');
    const pills = page.locator('.tb-pills');
    const cam = page.locator('.tb-cam');

    await page.getByTestId('hand-card-pg1').click();
    await expect(pills).toBeVisible();
    await expect(page.getByTestId('hand-card-pg1')).toHaveAttribute('data-sel', 'true');

    const before = await cam.getAttribute('data-cam');
    // The discard pile is bare table: a tap there would zoom out, but one that only put the card down does not.
    await page.locator('.tb-discard').click();
    await expect(pills).toBeHidden();
    await expect(page.getByTestId('hand-card-pg1')).toHaveAttribute('data-sel', 'false');
    await expect(cam).toHaveAttribute('data-cam', before!);

    // A second tap on the same card still takes it back, and the pills still play it.
    await page.getByTestId('hand-card-pg1').click();
    await expect(pills).toBeVisible();
    await page.getByTestId('hand-card-pg1').click();
    await expect(pills).toBeHidden();
    await page.getByTestId('hand-card-pg1').click();
    await pills.getByRole('button', { name: /Play Pass Go/ }).click();
    await expect(page.getByTestId('hand-card-pg1')).toHaveCount(0);
  });

  test('a wild on your table', async ({ page }) => {
    // wildcardUsage: Aarav's red set holds a red/yellow wild (rw_wild).
    await openDemo(page, 'wildcardUsage');
    await page.getByTestId('board-card-rw_wild').click();
    await expect(page.getByTestId('flip-wild-btn-rw_wild')).toBeVisible();

    await page.locator('.tb-discard').click();
    await expect(page.getByTestId('flip-wild-btn-rw_wild')).toBeHidden();
  });
});
