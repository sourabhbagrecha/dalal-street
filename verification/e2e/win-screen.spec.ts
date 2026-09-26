import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';
import { openDemo } from './helpers/demo';

test.describe('win screen', () => {
  test('winning property shows overlay and restart', async ({ page }) => {
    await openDemo(page, 'oneSetFromWinning');

    await dragCardToZone(page, 'hand-card-db2', 'properties-drop');

    await expect(page.getByTestId('win-overlay')).toBeVisible();
    await expect(page.getByTestId('win-overlay')).toContainText(/winner/i);

    await page.getByTestId('restart-btn').click();

    await expect(page.getByTestId('win-overlay')).not.toBeVisible();
    // "Deal again" deals a fresh table with the viewer (seat 0) to act first.
    await expect(page.getByTestId('hand-fan')).toBeVisible();
    const me = await page.getByTestId('self-stage').getAttribute('data-seat');
    expect(me).toBeTruthy();
    await expect(page.getByTestId('turn-banner')).toHaveAttribute('data-turn-id', me!);
  });
});
