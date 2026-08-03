import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';

async function loadFixture(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('Dev scenario').selectOption(name);
}

test.describe('win screen', () => {
  test('winning property shows overlay and restart', async ({ page }) => {
    await page.goto('/');
    await loadFixture(page, 'oneSetFromWinning');

    await dragCardToZone(page, 'hand-card-db2', 'properties-drop');

    await expect(page.getByTestId('win-overlay')).toBeVisible();
    await expect(page.getByTestId('win-overlay')).toContainText(/winner/i);

    await page.getByTestId('restart-btn').click();

    await expect(page.getByTestId('win-overlay')).not.toBeVisible();
    await expect(page.getByTestId('turn-banner')).toHaveAttribute('data-current-seat', '0');
  });
});
