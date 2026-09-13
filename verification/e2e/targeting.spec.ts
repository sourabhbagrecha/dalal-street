import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';

async function loadFixture(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('Dev scenario').selectOption(name);
  // Loading a fixture on /demo deals a brand-new server room over the
  // network (unlike the old /local pass-and-play's instant client-side
  // reprojection) — wait for it to land before touching the board.
  await expect(page.getByTestId('hand-fan')).toBeVisible();
}

test.describe('targeting', () => {
  test('debt collector prompts player choice', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'debtCollectorChoice');

    await dragCardToZone(page, 'hand-card-dc1', 'discard-drop');

    await expect(page.getByTestId('debt-collector-prompt')).toBeVisible();
    await expect(page.getByTestId('debt-collector-player-p2')).toBeVisible();
    await expect(page.getByTestId('debt-collector-player-p3')).toBeVisible();

    await page.getByTestId('debt-collector-player-p3').click();

    // Table feed shows display names, not raw ids — seat index 2 (p3) is "Marcus".
    await expect(page.getByTestId('table-feed')).toContainText(/marcus/i);
    await expect(page.getByTestId('table-feed')).toContainText(/debt|5M|\$5/i);
  });

  test('deal breaker steals complete set', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'dealBreakerOnSetWithHotel');

    await dragCardToZone(page, 'hand-card-dbk1', 'discard-drop');

    await expect(page.getByTestId('deal-breaker-prompt')).toBeVisible();
    await page.getByTestId('deal-breaker-set-set_yellow_full').click();

    // The properties panel shows city names, not a written color label — check a
    // stolen yellow-set (Tamil Nadu) card landed on the actor's board instead.
    await expect(page.getByTestId('properties-drop')).toContainText(
      /Chennai|Madurai|Thanjavur/i,
    );
    await expect(page.getByTestId('table-feed')).toContainText(/deal-broke|deal_breaker/i);
  });
});
