import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';

async function loadFixture(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('Dev scenario').selectOption(name);
  // Loading a fixture on /demo deals a brand-new server room over the
  // network (unlike the old /local pass-and-play's instant client-side
  // reprojection) — wait for it to land before touching the board.
  await expect(page.getByTestId('hand-fan')).toBeVisible();
}

// standardMidGame gives seat 1 a red/yellow rent card while their board holds
// only orange and light blue — playing it would discard the card and burn a
// play for nothing, which is exactly what the confirmation exists to catch.
test.describe('wasted discard play', () => {
  test('rent with no matching properties asks first, and Undo keeps the card', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'standardMidGame');

    const plays = page.locator('.game-center__plays-text');
    await expect(plays).toHaveText('3 of 3');

    await dragCardToZone(page, 'hand-card-r1', 'discard-drop');

    const prompt = page.getByTestId('wasted-play-prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(/properties/i);

    await page.getByTestId('wasted-play-undo-btn').click();

    await expect(prompt).toBeHidden();
    await expect(page.getByTestId('hand-card-r1')).toBeVisible();
    await expect(plays).toHaveText('3 of 3');
  });

  test('confirming plays the card anyway', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'standardMidGame');

    await dragCardToZone(page, 'hand-card-r1', 'discard-drop');
    await page.getByTestId('wasted-play-confirm-btn').click();

    await expect(page.getByTestId('wasted-play-prompt')).toBeHidden();
    await expect(page.getByTestId('hand-card-r1')).toHaveCount(0);
    await expect(page.locator('.game-center__plays-text')).toHaveText('2 of 3');
    await expect(page.getByTestId('table-feed')).toContainText(/no matching properties/i);
  });

  test('a rent card that can charge someone plays with no confirmation', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'standardMidGame');

    // Putting the red property down first makes the same rent card worth playing.
    await dragCardToZone(page, 'hand-card-pr1', 'properties-drop');
    await dragCardToZone(page, 'hand-card-r1', 'discard-drop');

    await expect(page.getByTestId('wasted-play-prompt')).toBeHidden();
  });
});
