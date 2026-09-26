import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';

async function loadFixture(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('Dev scenario').selectOption(name);
  // Loading a fixture on /demo deals a brand-new server room over the
  // network (not an instant client-side
  // reprojection) — wait for it to land before touching the board.
  await expect(page.getByTestId('hand-fan')).toBeVisible();
}

/**
 * /demo renders server projections, so each seat only ever sees its own
 * payment prompt (GamePrompts' PaymentRoundPrompts filters entries by
 * viewer). "All at once" = every payer's prompt is open simultaneously in
 * the same round: switch through the payer seats without anyone paying.
 */
async function expectEveryPayerPromptedAtOnce(page: import('@playwright/test').Page) {
  // The payee sees the round's status, not a prompt of their own.
  await expect(page.getByTestId('payment-round-prompts')).toBeVisible();
  await expect(page.locator('[data-testid^="payment-prompt"]')).toHaveCount(0);

  for (const seat of [2, 3, 4]) {
    // data-seat is 0-based: seat 2 = p2 = Priya … seat 4 = p4 = Yuki.
    await page.locator(`[data-seat="${seat - 1}"]`).click();
    await expect(page.getByTestId('payment-round-prompts')).toBeVisible();
    await expect(page.getByTestId(`payment-prompt-p${seat}`)).toBeVisible();
    // Only the viewer's own prompt — never another payer's.
    await expect(page.locator('[data-testid^="payment-prompt"]')).toHaveCount(1);
  }
}

test.describe('parallel payment', () => {
  test('dual rent shows payment prompts for all opponents at once', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'parallelRentCollection');

    await dragCardToZone(page, 'hand-card-rent_brown_lb', 'discard-drop');
    await expectEveryPayerPromptedAtOnce(page);
  });

  test('birthday shows payment prompts for all opponents at once', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'parallelBirthdayCollection');

    await dragCardToZone(page, 'hand-card-bd1', 'discard-drop');
    await expectEveryPayerPromptedAtOnce(page);
  });
});
