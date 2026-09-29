import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';
import { openDemo, tableNeverScrolls } from './helpers/demo';

test.describe('win screen', () => {
  test('winning property runs the celebration, then the summary, the table and back', async ({ page }) => {
    await openDemo(page, 'oneSetFromWinning');

    await dragCardToZone(page, 'hand-card-db2', 'properties-drop');

    // The celebration: winner name, then at least one set beat with a real state name (this fixture's
    // winner completes brown/utility/dark_blue — Gujarat/Uttar Pradesh/Maharashtra, per properties.ts).
    const overlay = page.getByTestId('win-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveAttribute('data-step', 'name', { timeout: 15_000 });
    await expect(overlay).toContainText(/win/i);
    await expect(overlay).toHaveAttribute('data-step', 'set', { timeout: 8_000 });
    await expect(overlay).toContainText(/Gujarat|Uttar Pradesh|Maharashtra/);

    // Skip jumps straight to the summary: standings for every seat, winner first.
    await page.getByTestId('win-skip').click();
    await expect(overlay).toHaveAttribute('data-step', 'summary');
    await expect(overlay).toContainText(/winner/i);
    await expect(page.locator('.gl-win__standings li')).toHaveCount(4);

    // The summary fits at phone width with no horizontal scroll.
    await page.setViewportSize({ width: 393, height: 852 });
    await expect(page.getByTestId('win-overlay')).toBeVisible();
    expect(await tableNeverScrolls(page)).toBe(true);
    await page.setViewportSize({ width: 800, height: 900 });

    // "View table" dismisses the summary down to a "Results" pill and leaves the final felt on screen.
    await page.getByTestId('view-table-btn').click();
    await expect(overlay).not.toBeVisible();
    await expect(page.getByTestId('self-stage')).toBeVisible();
    const resultsBtn = page.getByTestId('results-btn');
    await expect(resultsBtn).toBeVisible();

    // "Results" brings the summary straight back — the celebration never replays.
    await resultsBtn.click();
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveAttribute('data-step', 'summary');

    await page.getByTestId('restart-btn').click();

    await expect(overlay).not.toBeVisible();
    // "Deal again" deals a fresh table with the viewer (seat 0) to act first.
    await expect(page.getByTestId('hand-fan')).toBeVisible();
    const me = await page.getByTestId('self-stage').getAttribute('data-seat');
    expect(me).toBeTruthy();
    await expect(page.getByTestId('turn-banner')).toHaveAttribute('data-turn-id', me!);
  });
});
