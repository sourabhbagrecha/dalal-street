import { expect, test } from '@playwright/test';

async function loadFixture(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('Dev scenario').selectOption(name);
}

test.describe('just say no', () => {
  test('shows JSN prompt on correct seat', async ({ page }) => {
    await page.goto('/');
    await loadFixture(page, 'doubleJustSayNoChain');

    await page.locator('[data-seat="1"]').click();

    await expect(page.getByTestId('jsn-prompt')).toBeVisible();
    await expect(page.getByTestId('jsn-decline-btn')).toBeVisible();
    await expect(page.getByTestId('jsn-play-jsn_b')).toBeVisible();
  });
});
