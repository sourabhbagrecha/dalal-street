import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';

async function loadFixture(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('Dev scenario').selectOption(name);
}

test.describe('rent flow', () => {
  test('play rent from hand then pay on opponent seat', async ({ page }) => {
    await page.goto('/');
    await loadFixture(page, 'standardMidGame');

    await dragCardToZone(page, 'hand-card-pr1', 'properties-drop');
    await dragCardToZone(page, 'hand-card-r1', 'discard-drop');

    for (const seat of [1, 2, 3]) {
      const decline = page.getByTestId(`jsn-decline-btn-p${seat + 1}`);
      if (await decline.isVisible()) {
        await decline.click();
      }
    }

    await expect(page.getByTestId('payment-prompt-p2')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('payment-card-mb3').click();
    await page.getByTestId('confirm-payment-btn-p2').click();

    await expect(page.getByTestId('table-feed')).toContainText(/payment|paid|rent/i);
  });

  test('payment breaks completed set from fixture', async ({ page }) => {
    await page.goto('/');
    await loadFixture(page, 'payBreaksCompletedSet');

    await page.locator('[data-seat="1"]').click();
    await expect(page.getByTestId('payment-prompt')).toBeVisible();

    await page.getByTestId('payment-card-gg1').click();
    await page.getByTestId('payment-card-tiny').click();
    await expect(page.getByTestId('payment-card-gg1')).toHaveClass(/payment-card-btn--breaks-set/);

    await page.getByTestId('confirm-payment-btn').click();

    await expect(page.getByTestId('table-feed')).toContainText(/broken|break/i);
  });
});
