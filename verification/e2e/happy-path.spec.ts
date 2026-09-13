import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';

test.describe('happy path', () => {
  test('seat1 draws, banks money, ends turn, seat2 is current', async ({ page }) => {
    await page.goto('/demo');
    // /demo's default fixture loads over the network (a fresh server room),
    // unlike the old /local pass-and-play's instant client-side reprojection.
    await expect(page.getByTestId('hand-fan')).toBeVisible();

    await expect(page.getByTestId('turn-banner')).toHaveAttribute('data-current-seat', '0');

    await page.getByTestId('draw-pile').click();
    await expect(page.locator('.game-indicator').first()).toHaveClass(/game-indicator--active/);
    // The draw is a real command round-tripped to the server (no client-side
    // prediction), so the drawn card lands in the DOM asynchronously — wait
    // for it before the drag helper's un-retried, synchronous DOM lookup.
    await expect(page.getByTestId('hand-card-money_5m_22')).toBeVisible();

    await dragCardToZone(page, 'hand-card-money_5m_22', 'bank-drop');

    await expect(page.getByTestId('bank-drop').locator('[data-card-kind="money"]')).toBeVisible();

    await page.getByTestId('end-turn-btn').click();

    const logEntries = page.getByTestId('log-entry');
    await expect(logEntries).toHaveCount(4, { timeout: 5000 });
    await expect(page.getByTestId('table-feed')).toContainText(/drew|draw/i);
    await expect(page.getByTestId('table-feed')).toContainText(/bank/i);
    await expect(page.getByTestId('table-feed')).toContainText(/turn/i);

    // Desktop now spotlights seat2's turn instead of showing the table centre
    // to a bystander (same as phone) — switch to seat2's own view to read the
    // turn banner, same as this scenario's dev-only seat switcher exists for.
    // (This also auto-draws for seat2, same as any real turn start, hence
    // checking the log count above first.)
    await page.locator('[data-seat="1"]').click();
    await expect(page.getByTestId('turn-banner')).toHaveAttribute('data-current-seat', '1');
  });
});
