import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';

async function loadFixture(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('Dev scenario').selectOption(name);
}

test.describe('targeting', () => {
  test('debt collector prompts player choice', async ({ page }) => {
    await page.goto('/');
    await loadFixture(page, 'debtCollectorChoice');

    await dragCardToZone(page, 'hand-card-dc1', 'discard-drop');

    await expect(page.getByTestId('debt-collector-prompt')).toBeVisible();
    await expect(page.getByTestId('debt-collector-player-p2')).toBeVisible();
    await expect(page.getByTestId('debt-collector-player-p3')).toBeVisible();

    await page.getByTestId('debt-collector-player-p3').click();

    await expect(page.getByTestId('table-feed')).toContainText(/p3/i);
    await expect(page.getByTestId('table-feed')).toContainText(/debt|5M|\$5/i);
  });

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
