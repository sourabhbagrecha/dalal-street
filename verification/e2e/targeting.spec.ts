import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';
import { loadFixture } from './helpers/demo';

/**
 * Aiming an action on the felt table: a banner over the camera says what is
 * being picked, a tap on a rival's seat zooms in on them, and the pick is then
 * confirmed on their seat (the round TAKE/CHARGE button for a player, the set
 * tile itself for a Deal Breaker).
 */
test.describe('targeting', () => {
  test('debt collector prompts player choice', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'debtCollectorChoice');

    await dragCardToZone(page, 'hand-card-dc1', 'discard-drop');

    await expect(page.getByTestId('debt-collector-prompt')).toBeVisible();
    await expect(page.getByTestId('debt-collector-player-p2')).toBeVisible();
    await expect(page.getByTestId('debt-collector-player-p3')).toBeVisible();

    // Tap Marcus's seat, then TAKE on it.
    await page.getByTestId('debt-collector-player-p3').click();
    await expect(page.getByTestId('opponent-spotlight')).toHaveAttribute('data-player-id', 'p3');
    await page.getByRole('button', { name: /TAKE/ }).click();

    // Table feed shows display names, not raw ids — seat index 2 (p3) is "Marcus".
    await expect(page.getByTestId('table-feed')).toContainText(/marcus/i);
    await expect(page.getByTestId('table-feed')).toContainText(/debt|5M|\$5|₹5/i);
  });

  test('debt collector with a single rival charges them without asking', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'debtCollectorSoleRival');

    await dragCardToZone(page, 'hand-card-dc1', 'discard-drop');

    // No "who pays" pick and no TAKE tap: the only rival is charged straight away.
    await expect(page.getByTestId('table-feed')).toContainText(/debt|5M|\$5|₹5/i);
    await expect(page.getByTestId('debt-collector-prompt')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /TAKE/ })).toHaveCount(0);
  });

  test('deal breaker steals complete set', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'dealBreakerOnSetWithHotel');

    await dragCardToZone(page, 'hand-card-dbk1', 'discard-drop');

    await expect(page.getByTestId('deal-breaker-prompt')).toBeVisible();
    await page.getByTestId('opponent-peer-p2').click();
    // force: a pickable tile pulses (infinite animation), so it never reads as stable.
    await page.getByTestId('deal-breaker-set-set_yellow_full').click({ force: true });

    // The viewer's seat shows city names, not a written color label — check a
    // stolen yellow-set (Tamil Nadu) card landed on the actor's board instead.
    await expect(page.getByTestId('properties-drop')).toContainText(
      /Chennai|Madurai|Thanjavur/i,
    );
    await expect(page.getByTestId('table-feed')).toContainText(/deal-broke|deal_breaker/i);
  });
});
