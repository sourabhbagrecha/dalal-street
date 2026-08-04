/**
 * Scripted play covering every major action/interrupt type at least once, ending in a win.
 */
import { expect, test } from '@playwright/test';
import { clickHandCard, dragCardToZone } from './helpers/dnd';

async function loadFixture(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('Dev scenario').selectOption(name);
}

test.describe('full scripted game', () => {
  test('covers all action types then wins', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/local');

    // Live turn: draw, bank money, optional Pass Go, end turn
    await page.getByTestId('draw-pile').click();
    await dragCardToZone(page, 'hand-card-money_5m_22', 'bank-drop');
    const passGo = page.locator('[data-testid^="hand-card-action_pass_go"]');
    if ((await passGo.count()) > 0) {
      const id = await passGo.first().getAttribute('data-testid');
      if (id) await dragCardToZone(page, id, 'discard-drop');
      await expect(page.getByTestId('table-feed')).toContainText(/pass go|passed go/i);
    }
    await page.getByTestId('end-turn-btn').click();

    // Just Say No
    await loadFixture(page, 'doubleJustSayNoChain');
    await page.locator('[data-seat="1"]').click();
    await expect(page.getByTestId('jsn-prompt')).toBeVisible();
    await page.getByTestId('jsn-play-jsn_b').click();
    await expect(page.getByTestId('table-feed')).toContainText(/just say no/i);

    // Rent + payment
    await loadFixture(page, 'standardMidGame');
    await dragCardToZone(page, 'hand-card-pr1', 'properties-drop');
    await dragCardToZone(page, 'hand-card-r1', 'discard-drop');
    for (const seat of [1, 2, 3]) {
      const decline = page.getByTestId(`jsn-decline-btn-p${seat + 1}`);
      if (await decline.isVisible()) {
        await decline.click();
      }
    }
    await expect(page.getByTestId('payment-prompt-p2')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('payment-card-mb3').click();
    await page.getByTestId('confirm-payment-btn-p2').click();

    // Deal Breaker (set with house + hotel)
    await loadFixture(page, 'dealBreakerOnSetWithHotel');
    await dragCardToZone(page, 'hand-card-dbk1', 'discard-drop');
    await expect(page.getByTestId('deal-breaker-prompt')).toBeVisible();
    await page.getByTestId('deal-breaker-set-set_yellow_full').click();
    await expect(page.getByTestId('table-feed')).toContainText(/deal-broke|deal_breaker/i);

    // Hand-limit discard
    await loadFixture(page, 'overHandLimit');
    await expect(page.getByTestId('hand-limit-prompt')).toBeVisible();
    await clickHandCard(page, 'hand-card-oh0');
    await clickHandCard(page, 'hand-card-oh1');
    await page.getByTestId('confirm-discard-btn').click();

    // Payment breaks completed set
    await loadFixture(page, 'payBreaksCompletedSet');
    await page.locator('[data-seat="1"]').click();
    await page.getByTestId('payment-card-gg1').click();
    await page.getByTestId('payment-card-tiny').click();
    await page.getByTestId('confirm-payment-btn').click();
    await expect(page.getByTestId('table-feed')).toContainText(/broken|break/i);

    // Insufficient payment (debt-style)
    await loadFixture(page, 'insufficientPayment');
    await page.locator('[data-seat="1"]').click();
    await page.getByTestId('payment-card-only1').click();
    await page.getByTestId('confirm-payment-btn').click();
    await expect(page.getByTestId('table-feed')).toContainText(/paid|payment/i);

    // Win
    await loadFixture(page, 'oneSetFromWinning');
    await dragCardToZone(page, 'hand-card-db2', 'properties-drop');
    await expect(page.getByTestId('win-overlay')).toBeVisible();
    await expect(page.getByTestId('win-overlay')).toContainText(/winner/i);
  });
});
