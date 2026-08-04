import { expect, test } from '@playwright/test';
import { clickHandCard } from './helpers/dnd';

async function loadFixture(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('Dev scenario').selectOption(name);
}

test.describe('hand limit discard', () => {
  test('discards excess cards via selection and confirm', async ({ page }) => {
    await page.goto('/local');
    await loadFixture(page, 'overHandLimit');

    await expect(page.getByTestId('hand-limit-prompt')).toBeVisible();
    await expect(page.getByTestId('hand-limit-prompt')).toContainText('Discard 2');

    await clickHandCard(page, 'hand-card-oh0');
    await clickHandCard(page, 'hand-card-oh1');

    await page.getByTestId('confirm-discard-btn').click();

    await expect(page.getByTestId('hand-limit-prompt')).not.toBeVisible();
    await expect(page.getByTestId('table-feed')).toContainText(/discard/i);
  });
});
