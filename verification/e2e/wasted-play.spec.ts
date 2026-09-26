import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';
import { loadFixture } from './helpers/demo';

// standardMidGame gives seat 1 a red/yellow rent card while their board holds
// only orange and light blue — playing it would discard the card and burn a
// play for nothing, which is exactly what the confirmation exists to catch.
// Plays left are read off the HUD line ("Your turn · 3 plays left").
test.describe('wasted discard play', () => {
  test('rent with no matching properties asks first, and Undo keeps the card', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'standardMidGame');

    const hud = page.getByTestId('turn-banner');
    await expect(hud).toContainText('3 plays left');

    await dragCardToZone(page, 'hand-card-r1', 'discard-drop');

    const prompt = page.getByTestId('wasted-play-prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(/properties/i);

    await page.getByTestId('wasted-play-undo-btn').click();

    await expect(prompt).toBeHidden();
    await expect(page.getByTestId('hand-card-r1')).toBeVisible();
    await expect(hud).toContainText('3 plays left');
  });

  test('confirming plays the card anyway', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'standardMidGame');

    await dragCardToZone(page, 'hand-card-r1', 'discard-drop');
    await page.getByTestId('wasted-play-confirm-btn').click();

    await expect(page.getByTestId('wasted-play-prompt')).toBeHidden();
    await expect(page.getByTestId('hand-card-r1')).toHaveCount(0);
    await expect(page.getByTestId('turn-banner')).toContainText('2 plays left');
    await expect(page.getByTestId('table-feed')).toContainText(/no matching properties/i);
  });

  test('a rent card that can charge someone plays with no confirmation', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'standardMidGame');

    // Putting the red property down first makes the same rent card worth playing.
    await dragCardToZone(page, 'hand-card-pr1', 'properties-drop');
    await expect(page.getByTestId('hand-card-pr1')).toHaveCount(0);
    await dragCardToZone(page, 'hand-card-r1', 'discard-drop');

    await expect(page.getByTestId('wasted-play-prompt')).toBeHidden();
    await expect(page.getByTestId('hand-card-r1')).toHaveCount(0);
  });

  test('a Deal Breaker with no complete set anywhere says so and moves on', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'dealBreakerNoSets');

    await dragCardToZone(page, 'hand-card-dbk1', 'discard-drop');
    await page.getByTestId('wasted-play-confirm-btn').click();

    const banner = page.getByTestId('deal-breaker-prompt');
    await expect(banner).toContainText('No player has a complete set');
    await expect(banner).toBeHidden();
    await expect(page.getByTestId('turn-banner')).toContainText('2 plays left');
    await expect(page.getByTestId('table-feed')).toContainText(/wasted Deal Breaker · no complete set to take/i);
  });

  for (const { card, title, name } of [
    { card: 'sd1', title: 'No property to take', name: 'Sly Deal' },
    { card: 'fd1', title: 'No property to swap', name: 'Forced Deal' },
  ]) {
    test(`a ${name} with nothing to take says so and moves on`, async ({ page }) => {
      await page.goto('/demo');
      await loadFixture(page, 'stealNoTargets');

      await dragCardToZone(page, `hand-card-${card}`, 'discard-drop');
      await page.getByTestId('wasted-play-confirm-btn').click();

      const banner = page.getByTestId(card === 'sd1' ? 'steal-target-prompt' : 'forced-deal-prompt');
      await expect(banner).toContainText(title);
      await expect(banner).toBeHidden();
      await expect(page.getByTestId('turn-banner')).toContainText('2 plays left');
      await expect(page.getByTestId('table-feed')).toContainText(`wasted ${name}`);
    });
  }
});
