import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';

test.describe('happy path', () => {
  test('seat1 draws, banks money, ends turn, seat2 is current', async ({ page }) => {
    await page.goto('/local');

    await expect(page.getByTestId('turn-banner')).toHaveAttribute('data-current-seat', '0');

    await page.getByTestId('draw-pile').click();
    await expect(page.locator('.game-indicator').first()).toHaveClass(/game-indicator--active/);

    await dragCardToZone(page, 'hand-card-money_5m_22', 'bank-drop');

    await expect(page.getByTestId('bank-drop').locator('[data-card-kind="money"]')).toBeVisible();

    await page.getByTestId('end-turn-btn').click();

    await expect(page.getByTestId('turn-banner')).toHaveAttribute('data-current-seat', '1');

    const logEntries = page.getByTestId('log-entry');
    await expect(logEntries).toHaveCount(4, { timeout: 5000 });
    await expect(page.getByTestId('table-feed')).toContainText(/drew|draw/i);
    await expect(page.getByTestId('table-feed')).toContainText(/bank/i);
    await expect(page.getByTestId('table-feed')).toContainText(/turn/i);
  });
});
