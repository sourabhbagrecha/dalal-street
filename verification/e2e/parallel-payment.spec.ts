import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';

async function loadFixture(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('Dev scenario').selectOption(name);
  // Loading a fixture on /demo deals a brand-new server room over the
  // network (unlike the old /local pass-and-play's instant client-side
  // reprojection) — wait for it to land before touching the board.
  await expect(page.getByTestId('hand-fan')).toBeVisible();
}

test.describe('parallel payment', () => {
  test('dual rent shows payment prompts for all opponents at once', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'parallelRentCollection');

    await dragCardToZone(page, 'hand-card-rent_brown_lb', 'discard-drop');

    await expect(page.getByTestId('payment-round-prompts')).toBeVisible();
    await expect(page.getByTestId('payment-prompt-p2')).toBeVisible();
    await expect(page.getByTestId('payment-prompt-p3')).toBeVisible();
    await expect(page.getByTestId('payment-prompt-p4')).toBeVisible();
  });

  test('birthday shows payment prompts for all opponents at once', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'parallelBirthdayCollection');

    await dragCardToZone(page, 'hand-card-bd1', 'discard-drop');

    await expect(page.getByTestId('payment-round-prompts')).toBeVisible();
    await expect(page.getByTestId('payment-prompt-p2')).toBeVisible();
    await expect(page.getByTestId('payment-prompt-p3')).toBeVisible();
    await expect(page.getByTestId('payment-prompt-p4')).toBeVisible();
  });
});
