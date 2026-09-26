import { expect, test, type Page } from '@playwright/test';
import { openDemo } from './helpers/demo';

/**
 * Table reactions (table/reactions/Reactions.tsx): a face button just above the tray opens a picker of eight faces; a
 * pick flies up from the button at once and the picker closes. The button steps aside while a card is picked up (its
 * pills sit in the same spot), and the faces never take a pointer, so play goes on under them. Delivery to the other
 * seats is covered in e2e-net/reactions.spec.ts.
 */

async function selfId(page: Page): Promise<string> {
  return (await page.getByTestId('self-stage').getAttribute('data-seat'))!;
}

test.describe('table reactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await openDemo(page, 'standardMidGame');
  });

  test('the picker offers eight faces and a pick flies up from the button', async ({ page }) => {
    const button = page.getByTestId('reaction-btn');
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');

    const menu = page.getByTestId('reaction-menu');
    await expect(menu.getByRole('menuitem')).toHaveCount(8);
    for (const kind of ['happy', 'laugh', 'excited', 'love', 'shocked', 'sad', 'angry', 'cool']) {
      await expect(page.getByTestId(`reaction-${kind}`)).toBeVisible();
    }
    // The whole picker is on screen at phone width.
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(393);

    await page.getByTestId('reaction-love').click();
    await expect(menu).toBeHidden();
    const burst = page.getByTestId(`reaction-burst-${await selfId(page)}`);
    await expect(burst).toBeVisible();
    await expect(burst).toHaveAttribute('data-reaction', 'love');
    await expect(page.getByRole('status').filter({ hasText: 'You: Love' })).toBeAttached();
    // A face in the air never takes a pointer, so play goes on under it.
    await expect(page.locator('.rx-layer')).toHaveCSS('pointer-events', 'none');
    // It is a moment, not a fixture: gone again a few seconds later.
    await expect(burst).toHaveCount(0, { timeout: 5000 });
  });

  test('Escape and a tap elsewhere both close the picker, and the button steps aside while a card is picked', async ({ page }) => {
    const button = page.getByTestId('reaction-btn');
    await button.click();
    await expect(page.getByTestId('reaction-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('reaction-menu')).toBeHidden();
    await expect(button).toBeFocused();

    await button.click();
    await expect(page.getByTestId('reaction-menu')).toBeVisible();
    await page.getByTestId('turn-banner').click();
    await expect(page.getByTestId('reaction-menu')).toBeHidden();

    // The button steps aside while a card is picked (its pills sit in the same spot), and comes back after.
    await expect(button).toBeVisible();
    await page.locator('[data-testid^="hand-card-"]').first().click();
    await expect(page.locator('.tb-pills')).toBeVisible();
    await expect(button).toBeHidden();
    // Tapping the same card again puts it back.
    await page.locator('[data-testid^="hand-card-"]').first().click();
    await expect(page.locator('.tb-pills')).toBeHidden();
    await expect(button).toBeVisible();
  });
});
