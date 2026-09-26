import { expect, test, type Page } from '@playwright/test';
import { openDemo } from './helpers/demo';

// buildingChoice: p1 holds a House and a Hotel. Light blue and brown are complete and can take a house; the full
// railroad never can, and orange is unfinished — so exactly two sets are offered, plus the bank.

/** Tap a hand card, then the pill that plays it (`Play House`) or banks it (`Bank …`). */
async function tapCardThenPill(page: Page, cardId: string, pill: RegExp) {
  await page.getByTestId(`hand-card-${cardId}`).click();
  await page.locator('.tb-pills__row').getByRole('button', { name: pill }).click();
}

test.describe('house and hotel', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 659 });
    await openDemo(page, 'buildingChoice');
    await expect(page.getByTestId('hand-card-hz1')).toBeVisible();
  });

  test('a house asks which set (only ones that can take it) or the bank; Undo keeps it, a set builds in one step', async ({
    page,
  }) => {
    await tapCardThenPill(page, 'hz1', /Play House/);

    await expect(page.getByTestId('building-choice-prompt')).toBeVisible();
    await expect(page.getByTestId('building-choice-set-set_lb')).toBeVisible();
    await expect(page.getByTestId('building-choice-set-set_brown')).toBeVisible();
    await expect(page.getByTestId('building-choice-set-set_rr')).toHaveCount(0);
    await expect(page.getByTestId('building-choice-set-set_orange')).toHaveCount(0);
    await expect(page.getByTestId('building-choice-cash-btn')).toHaveText('Add to Bank');

    await page.getByTestId('building-choice-cancel-btn').click();
    await expect(page.getByTestId('building-choice-prompt')).toBeHidden();
    await expect(page.getByTestId('hand-card-hz1')).toBeVisible();
    await expect(page.getByText(/3 plays left/)).toBeVisible();

    // Choosing a set builds on it in one step, with no leftover "pick a set" prompt.
    await tapCardThenPill(page, 'hz1', /Play House/);
    await page.getByTestId('building-choice-set-set_brown').click();

    await expect(page.getByTestId('building-choice-prompt')).toBeHidden();
    await expect(page.getByTestId('hand-card-hz1')).toHaveCount(0);
    await expect(page.getByText(/2 plays left/)).toBeVisible();
    await expect(page.getByTestId('building-prompt')).toBeHidden();
  });

  test('a hotel has no set until a house is down, so it can only be banked', async ({ page }) => {
    await tapCardThenPill(page, 'ht1', /Play Hotel/);

    await expect(page.getByTestId('building-choice-prompt')).toBeVisible();
    await expect(page.locator('[data-testid^="building-choice-set-"]')).toHaveCount(0);

    await page.getByTestId('building-choice-cash-btn').click();
    await expect(page.getByTestId('hand-card-ht1')).toHaveCount(0);
    await expect(page.getByText(/2 plays left/)).toBeVisible();
  });
});
