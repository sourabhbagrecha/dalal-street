import { expect, test } from '@playwright/test';
import { openDemo, switchSeat } from './helpers/demo';

test.describe('just say no', () => {
  test('a Debt Collector bill carries the Just Say No; playing it lands in the feed and asks the actor', async ({ page }) => {
    await openDemo(page, 'doubleJustSayNoChain');

    // Priya (p2, seat index 1) is the respondent. A Debt Collector on her is the payment itself — the same prompt
    // whether she holds a Just Say No or not — with her Just Say No on it.
    await switchSeat(page, 1);

    await expect(page.getByTestId('payment-prompt')).toBeVisible();
    await expect(page.getByTestId('jsn-prompt')).toHaveCount(0);
    await page.getByTestId('jsn-play-jsn_b').click();
    await expect(page.getByTestId('table-feed')).toContainText(/just say no/i);
    await expect(page.getByTestId('payment-prompt')).toBeHidden();

    // Aarav (p1) is always asked back, holding a counter or not.
    await switchSeat(page, 0);
    await expect(page.getByTestId('jsn-prompt')).toBeVisible();
    await expect(page.getByTestId('jsn-decline-btn')).toBeVisible();
  });
});
