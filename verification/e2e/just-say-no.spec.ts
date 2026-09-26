import { expect, test } from '@playwright/test';
import { openDemo, switchSeat } from './helpers/demo';

test.describe('just say no', () => {
  test('shows JSN prompt on correct seat, and playing it lands in the feed', async ({ page }) => {
    await openDemo(page, 'doubleJustSayNoChain');

    // Priya (p2, seat index 1) is the respondent; only her seat gets the alert.
    await switchSeat(page, 1);

    await expect(page.getByTestId('jsn-prompt')).toBeVisible();
    await expect(page.getByTestId('jsn-decline-btn')).toBeVisible();
    await expect(page.getByTestId('jsn-play-jsn_b')).toBeVisible();

    await page.getByTestId('jsn-play-jsn_b').click();
    await expect(page.getByTestId('table-feed')).toContainText(/just say no/i);
  });
});
