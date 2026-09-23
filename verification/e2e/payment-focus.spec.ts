import { expect, test, type Page } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';

async function loadFixture(page: Page, name: string) {
  await page.getByLabel('Dev scenario').selectOption(name);
  await expect(page.getByTestId('hand-fan')).toBeVisible();
}

/** Asserts nothing from Table Moments sits over the payment prompt for the whole window. */
async function expectNoMomentOverlays(page: Page, windowMs: number) {
  const until = Date.now() + windowMs;
  while (Date.now() < until) {
    expect(await page.getByTestId('moment-callout').count()).toBe(0);
    expect(await page.getByTestId('notice-stack').count()).toBe(0);
    await page.waitForTimeout(150);
  }
}

/**
 * While the viewer picks payment cards, the callout ticket and notice stack
 * step aside (apps/web/src/moments/paymentFocus.ts): the prompt already says
 * who wants what, and the overlays used to cover its card grid for 5–10s.
 * Seat keys: 1 = p1 = Aarav, 2 = p2 = Priya, 3 = p3 = Marcus, 4 = p4 = Yuki.
 */
test.describe('payment focus', () => {
  test('birthday — each payer picks cards with no overlays; no demand notice afterwards', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'parallelBirthdayCollection');

    await dragCardToZone(page, 'hand-card-bd1', 'discard-drop');
    await page.keyboard.press('2');

    const prompt = page.getByTestId('payment-prompt-p2');
    await expect(prompt).toBeVisible();
    await expectNoMomentOverlays(page, 1500);

    const cardButtons = prompt.locator('[data-testid^="payment-card-"]');
    const cardCount = await cardButtons.count();
    for (let i = 0; i < cardCount; i++) await cardButtons.nth(i).click();
    await page.getByTestId('confirm-payment-btn-p2').click();
    await expect(prompt).toBeHidden();

    const noticeTexts = await page.getByTestId('notice').allTextContents();
    expect(noticeTexts.some((t) => /wants .* from you/i.test(t))).toBe(false);
  });
});
