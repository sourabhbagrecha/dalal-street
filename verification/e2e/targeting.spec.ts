import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';

async function loadFixture(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('Dev scenario').selectOption(name);
}

test.describe('targeting', () => {
  test('deal breaker steals complete set', async ({ page }) => {
    await page.goto('/');
    await loadFixture(page, 'dealBreakerOnSetWithHotel');

    await dragCardToZone(page, 'hand-card-dbk1', 'discard-drop');

    await expect(page.getByTestId('deal-breaker-prompt')).toBeVisible();
    await page.getByTestId('deal-breaker-set-set_yellow_full').click();

    await expect(page.getByTestId('properties-drop')).toContainText(/Yellow/i);
    await expect(page.getByTestId('table-feed')).toContainText(/deal-broke|deal_breaker/i);
  });
});
