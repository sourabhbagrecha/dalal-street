import { expect, test } from '@playwright/test';
import { loadFixture, switchSeat } from './helpers/demo';

test.describe('just say no', () => {
  test('shows JSN prompt on correct seat', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'doubleJustSayNoChain');

    // Priya (p2, seat index 1) is the respondent; only her seat gets the alert.
    await switchSeat(page, 1);

    await expect(page.getByTestId('jsn-prompt')).toBeVisible();
    await expect(page.getByTestId('jsn-decline-btn')).toBeVisible();
    await expect(page.getByTestId('jsn-play-jsn_b')).toBeVisible();
  });
});
