import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';

async function loadFixture(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('Dev scenario').selectOption(name);
  // Loading a fixture on /demo deals a brand-new server room over the
  // network (unlike the old /local pass-and-play's instant client-side
  // reprojection) — wait for it to land before touching the board.
  await expect(page.getByTestId('hand-fan')).toBeVisible();
}

test.describe('win screen', () => {
  test('winning property shows overlay and restart', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'oneSetFromWinning');

    await dragCardToZone(page, 'hand-card-db2', 'properties-drop');

    await expect(page.getByTestId('win-overlay')).toBeVisible();
    await expect(page.getByTestId('win-overlay')).toContainText(/winner/i);

    await page.getByTestId('restart-btn').click();

    await expect(page.getByTestId('win-overlay')).not.toBeVisible();
    await expect(page.getByTestId('turn-banner')).toHaveAttribute('data-current-seat', '0');
  });
});
