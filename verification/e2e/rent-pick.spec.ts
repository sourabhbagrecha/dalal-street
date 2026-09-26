import { expect, test } from '@playwright/test';
import { loadFixture } from './helpers/demo';

// wildRentPick: p1 holds a ten-colour Wild Rent over ten sets (light blue complete, the rest partial), the crowded case
// for the rent pick. It stays calm: no gold ring or bob on the sets, just what each would charge, under its name.

test.describe('rent pick', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/demo');
    await loadFixture(page, 'wildRentPick');
    await page.getByTestId('hand-card-rw1').click();
    await page.locator('.tb-pills__row').getByRole('button', { name: /Play Rent/ }).click();
    await expect(page.getByTestId('rent-color-prompt')).toBeVisible();
    // The click may scroll the table's own box to reach the pill; a player never does.
    await page.evaluate(() => {
      document.querySelector('.tb')!.scrollTop = 0;
    });
  });

  test('every set shows its rent in a pill under its name, and none is ringed', async ({ page }) => {
    const sets = page.locator('[data-testid^="rent-color-"]:not([data-testid="rent-color-prompt"])');
    await expect(sets).toHaveCount(10);
    for (const set of await sets.all()) {
      await expect(set.locator('.tb-set__rent')).toHaveText(/^₹\d+Cr$/);
      await expect(set).not.toHaveAttribute('data-hot', 'true');
    }
  });

  test('a pill in the top row sits inside the panel, not cut off at its edge', async ({ page }) => {
    const body = await page.locator('.tb-mine__body').boundingBox();
    const pill = await page.getByTestId('rent-color-brown').locator('.tb-set__rent').boundingBox();
    expect(body && pill).toBeTruthy();
    expect(pill!.y).toBeGreaterThanOrEqual(body!.y);
    expect(pill!.x).toBeGreaterThanOrEqual(body!.x);
    expect(pill!.x + pill!.width).toBeLessThanOrEqual(body!.x + body!.width);
  });

  test('tapping a set picks its colour and moves on to who pays', async ({ page }) => {
    await page.getByTestId('rent-color-brown').click();
    await expect(page.getByTestId('rent-color-prompt')).toBeHidden();
    await expect(page.getByTestId('rent-player-prompt')).toBeVisible();
  });
});
