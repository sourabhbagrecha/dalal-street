import { expect, test } from '@playwright/test';
import { openDemo } from './helpers/demo';

// wildRentPick: p1 holds a ten-colour Wild Rent over ten sets (light blue complete, the rest partial), the crowded case
// for the rent pick. It stays calm: no gold ring or bob on the sets, just what each would charge, under its name.

test.describe('rent pick', () => {
  test('every set shows its rent in an unclipped pill, none is ringed, and a tap picks the colour', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await openDemo(page, 'wildRentPick');
    await page.getByTestId('hand-card-rw1').click();
    await page.locator('.tb-pills__row').getByRole('button', { name: /Play Rent/ }).click();
    await expect(page.getByTestId('rent-color-prompt')).toBeVisible();
    // The click may scroll the table's own box to reach the pill; a player never does.
    await page.evaluate(() => {
      document.querySelector('.tb')!.scrollTop = 0;
    });

    const sets = page.locator('[data-testid^="rent-color-"]:not([data-testid="rent-color-prompt"])');
    await expect(sets).toHaveCount(10);
    for (const set of await sets.all()) {
      await expect(set.locator('.tb-set__rent')).toHaveText(/^₹\d+Cr$/);
      await expect(set).not.toHaveAttribute('data-hot', 'true');
    }

    // A pill in the top row sits inside the panel, not cut off at its edge.
    const body = await page.locator('.tb-mine__body').boundingBox();
    const pill = await page.getByTestId('rent-color-brown').locator('.tb-set__rent').boundingBox();
    expect(body && pill).toBeTruthy();
    expect(pill!.y).toBeGreaterThanOrEqual(body!.y);
    expect(pill!.x).toBeGreaterThanOrEqual(body!.x);
    expect(pill!.x + pill!.width).toBeLessThanOrEqual(body!.x + body!.width);

    // Tapping a set picks its colour and moves on to who pays.
    await page.getByTestId('rent-color-brown').click();
    await expect(page.getByTestId('rent-color-prompt')).toBeHidden();
    await expect(page.getByTestId('rent-player-prompt')).toBeVisible();
  });
});
