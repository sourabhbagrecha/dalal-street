import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';
import { openDemo } from './helpers/demo';

// standardMidGame gives seat 1 a red/yellow rent card while their board holds
// only orange and light blue — playing it would discard the card and burn a
// play for nothing, which is exactly what the confirmation exists to catch.
// Plays left are read off the HUD line ("Your turn · 3 plays left").
// The other side, a rent that can charge someone playing with no question, is
// asserted in rent-flow.spec.ts.
test.describe('wasted discard play', () => {
  test('rent with no matching properties asks first: Undo keeps the card, Yes plays it anyway', async ({ page }) => {
    await openDemo(page, 'standardMidGame');

    const hud = page.getByTestId('turn-banner');
    await expect(hud).toContainText('3 plays left');

    await dragCardToZone(page, 'hand-card-r1', 'discard-drop');

    const prompt = page.getByTestId('wasted-play-prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(/properties/i);
    await expect(prompt).toContainText(/colours/i);
    await expect(prompt).toContainText(/one of your plays used up/i);

    await page.getByTestId('wasted-play-undo-btn').click();

    await expect(prompt).toBeHidden();
    await expect(page.getByTestId('hand-card-r1')).toBeVisible();
    await expect(hud).toContainText('3 plays left');

    await dragCardToZone(page, 'hand-card-r1', 'discard-drop');
    await page.getByTestId('wasted-play-confirm-btn').click();

    await expect(prompt).toBeHidden();
    await expect(page.getByTestId('hand-card-r1')).toHaveCount(0);
    await expect(hud).toContainText('2 plays left');
    await expect(page.getByTestId('table-feed')).toContainText(/no matching properties/i);
  });

  test('a Deal Breaker with no complete set anywhere says so and moves on', async ({ page }) => {
    await openDemo(page, 'dealBreakerNoSets');

    await dragCardToZone(page, 'hand-card-dbk1', 'discard-drop');
    await page.getByTestId('wasted-play-confirm-btn').click();

    const banner = page.getByTestId('deal-breaker-prompt');
    await expect(banner).toContainText('No player has a complete set');
    await expect(banner).toBeHidden();
    await expect(page.getByTestId('turn-banner')).toContainText('2 plays left');
    await expect(page.getByTestId('table-feed')).toContainText(/wasted Deal Breaker · no complete set to take/i);
  });

  test('a Sly Deal and a Forced Deal with nothing to take each say so and move on', async ({ page }) => {
    // stealNoTargets: the viewer holds both, and no rival has a property either could take.
    await openDemo(page, 'stealNoTargets');

    const steps = [
      { card: 'sd1', banner: 'steal-target-prompt', title: 'No property to take', name: 'Sly Deal', left: '2 plays left' },
      { card: 'fd1', banner: 'forced-deal-prompt', title: 'No property to swap', name: 'Forced Deal', left: '1 play left' },
    ];
    for (const { card, banner, title, name, left } of steps) {
      await dragCardToZone(page, `hand-card-${card}`, 'discard-drop');
      await page.getByTestId('wasted-play-confirm-btn').click();

      const el = page.getByTestId(banner);
      await expect(el).toContainText(title);
      await expect(el).toBeHidden();
      await expect(page.getByTestId('turn-banner')).toContainText(left);
      await expect(page.getByTestId('table-feed')).toContainText(`wasted ${name}`);
    }
  });
});
