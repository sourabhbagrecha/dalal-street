import { expect, test } from '@playwright/test';
import { clickHandCard } from './helpers/dnd';
import { openDemo } from './helpers/demo';

/**
 * The hand-limit discard on the felt table: a banner over the camera counts
 * the picks ("Discard 1 of 2"), a tap on a hand card marks it, and the tray's
 * round button becomes DISCARD once enough are marked. /demo deals the fixture
 * as a real server room, so every step here is a network round trip.
 */
test.describe('hand limit discard', () => {
  test('discards excess cards via selection and confirm', async ({ page }) => {
    await openDemo(page, 'overHandLimit');

    const prompt = page.getByTestId('hand-limit-prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('Discard 0 of 2');

    await clickHandCard(page, 'hand-card-oh0');
    await clickHandCard(page, 'hand-card-oh1');
    await expect(prompt).toContainText('Discard 2 of 2');

    // force: the red round button throbs (tb-throb, infinite) once the picks are in, so it never reads as stable.
    await page.getByTestId('confirm-discard-btn').click({ force: true });

    await expect(prompt).not.toBeVisible();
    await expect(page.getByTestId('table-feed')).toContainText(/discard/i);
    await expect(page.locator('[data-testid^="hand-card-"]')).toHaveCount(7);
  });
});
