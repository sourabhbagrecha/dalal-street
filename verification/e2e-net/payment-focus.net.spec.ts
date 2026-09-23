import { expect, test, type Page } from '@playwright/test';
import { closePlayers } from './helpers.js';
import { dragCardToZone, seedAndJoinFixture } from './momentsHelpers.js';

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
 * Payment focus over the real server + SSE: while a seat picks payment cards,
 * Table Moments' callout and notices stay off its screen
 * (apps/web/src/moments/paymentFocus.ts). Seat 1 = p1 = Aarav … seat 4 = p4 = Yuki.
 */
test.describe('payment focus over the network', () => {
  test('debt collector — payer sees only the prompt; the payee still gets the receipt', async ({ browser }) => {
    test.slow();
    const { players } = await seedAndJoinFixture(browser, 'debtCollectorChoice', [
      'Aarav',
      'Priya',
      'Marcus',
      'Yuki',
    ]);
    const [p1, , p3] = players;
    try {
      await dragCardToZone(p1!.page, 'hand-card-dc1', 'discard-drop');
      await p1!.page.getByTestId('debt-collector-player-p3').click();

      const paymentPrompt = p3!.page.getByTestId('payment-prompt');
      await expect(paymentPrompt).toBeVisible({ timeout: 8000 });
      await expectNoMomentOverlays(p3!.page, 2000);

      const cardButtons = p3!.page.locator('[data-testid^="payment-card-"]');
      const cardCount = await cardButtons.count();
      for (let i = 0; i < cardCount; i++) await cardButtons.nth(i).click();
      await p3!.page.getByTestId('confirm-payment-btn').click();
      await expect(paymentPrompt).toBeHidden({ timeout: 8000 });

      // The demand was spent while the prompt was up — it never replays afterwards.
      await expect(p3!.page.getByTestId('moment-callout')).toHaveCount(0);
      await expect(p1!.page.getByTestId('notice').first()).toContainText(/Marcus paid you/i, {
        timeout: 8000,
      });
    } finally {
      await closePlayers(players);
    }
  });

  test('parallel birthday — a payer is not covered by other payers settling up', async ({ browser }) => {
    test.slow();
    const { players } = await seedAndJoinFixture(browser, 'parallelBirthdayCollection', [
      'Aarav',
      'Priya',
      'Marcus',
      'Yuki',
    ]);
    const [p1, p2, p3] = players;
    try {
      await dragCardToZone(p1!.page, 'hand-card-bd1', 'discard-drop');

      const p2Prompt = p2!.page.getByTestId('payment-prompt-p2');
      const p3Prompt = p3!.page.getByTestId('payment-prompt-p3');
      await expect(p2Prompt).toBeVisible({ timeout: 8000 });
      await expect(p3Prompt).toBeVisible({ timeout: 8000 });

      // Marcus pays first; Priya, still choosing, must not get his "paid" callout on top of her cards.
      const p3Cards = p3Prompt.locator('[data-testid^="payment-card-"]');
      const p3Count = await p3Cards.count();
      for (let i = 0; i < p3Count; i++) await p3Cards.nth(i).click();
      await p3!.page.getByTestId('confirm-payment-btn-p3').click();
      await expect(p3Prompt).toBeHidden({ timeout: 8000 });

      await expectNoMomentOverlays(p2!.page, 2000);

      const p2Cards = p2Prompt.locator('[data-testid^="payment-card-"]');
      const p2Count = await p2Cards.count();
      for (let i = 0; i < p2Count; i++) await p2Cards.nth(i).click();
      await p2!.page.getByTestId('confirm-payment-btn-p2').click();
      await expect(p2Prompt).toBeHidden({ timeout: 8000 });

      // Held callouts play once the prompt is gone.
      await expect(p2!.page.getByTestId('moment-callout')).toBeVisible({ timeout: 8000 });
    } finally {
      await closePlayers(players);
    }
  });
});
