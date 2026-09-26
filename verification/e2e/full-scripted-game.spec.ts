/**
 * Scripted play covering every major action/interrupt type at least once, ending in a win.
 */
import { expect, test } from '@playwright/test';
import { clickHandCard, dragCardToZone } from './helpers/dnd';
import { loadFixture, switchSeat } from './helpers/demo';

test.describe('full scripted game', () => {
  test('covers all action types then wins', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/demo');

    // Live turn. /demo opens on standardMidGame mid-turn (seat 1 has already
    // drawn — turn-start draws are automatic now): bank money, Pass Go, end turn.
    await expect(page.getByTestId('hand-fan')).toBeVisible({ timeout: 15_000 });
    await dragCardToZone(page, 'hand-card-m1', 'bank-drop');
    await expect(page.getByTestId('hand-card-m1')).toHaveCount(0);
    await dragCardToZone(page, 'hand-card-pg1', 'discard-drop');
    await expect(page.getByTestId('table-feed')).toContainText(/pass go|passed go/i);
    await page.getByTestId('end-turn-btn').click();
    // Priya's turn: the round button is no longer Aarav's END TURN.
    await expect(page.getByTestId('end-turn-btn')).toHaveCount(0);

    // Just Say No
    await loadFixture(page, 'doubleJustSayNoChain');
    await switchSeat(page, 1);
    await expect(page.getByTestId('jsn-prompt')).toBeVisible();
    await page.getByTestId('jsn-play-jsn_b').click();
    await expect(page.getByTestId('table-feed')).toContainText(/just say no/i);

    // Rent + payment. /demo renders one seat at a time, so each respondent's
    // Just Say No / payment prompt is answered from that seat's own view.
    await loadFixture(page, 'standardMidGame');
    await dragCardToZone(page, 'hand-card-pr1', 'properties-drop');
    await expect(page.locator('[data-testid="properties-drop"] [data-cid="pr1"]')).toBeVisible();
    await dragCardToZone(page, 'hand-card-r1', 'discard-drop');
    await expect(page.getByTestId('hand-card-r1')).toHaveCount(0);
    await switchSeat(page, 1);
    // Priya holds a Just Say No, so she is asked before paying.
    await page.getByTestId('jsn-decline-btn-p2').click();
    await expect(page.getByTestId('payment-prompt')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('payment-card-mb3').click();
    await page.getByTestId('confirm-payment-btn').click({ force: true });
    await expect(page.getByTestId('payment-prompt')).toBeHidden({ timeout: 8000 });

    // Deal Breaker (set with house + hotel). Aiming is done on the felt: zoom
    // in on the rival, then tap the complete set to take.
    await loadFixture(page, 'dealBreakerOnSetWithHotel');
    await dragCardToZone(page, 'hand-card-dbk1', 'discard-drop');
    await expect(page.getByTestId('deal-breaker-prompt')).toBeVisible();
    await page.getByTestId('opponent-peer-p2').click();
    await page.getByTestId('deal-breaker-set-set_yellow_full').click({ force: true });
    await expect(page.getByTestId('table-feed')).toContainText(/deal-broke|deal_breaker/i);

    // Hand-limit discard
    await loadFixture(page, 'overHandLimit');
    await expect(page.getByTestId('hand-limit-prompt')).toBeVisible();
    await clickHandCard(page, 'hand-card-oh0');
    await clickHandCard(page, 'hand-card-oh1');
    await page.getByTestId('confirm-discard-btn').click();
    await expect(page.getByTestId('hand-limit-prompt')).toBeHidden();
    await expect(page.locator('[data-testid^="hand-card-"]')).toHaveCount(7);

    // Payment breaks completed set
    await loadFixture(page, 'payBreaksCompletedSet');
    await switchSeat(page, 1);
    await page.getByTestId('payment-card-gg1').click();
    await page.getByTestId('payment-card-tiny').click();
    await page.getByTestId('confirm-payment-btn').click({ force: true });
    await expect(page.getByTestId('table-feed')).toContainText(/set broke|broken|break/i);

    // Insufficient payment (debt-style)
    await loadFixture(page, 'insufficientPayment');
    await switchSeat(page, 1);
    await page.getByTestId('payment-card-only1').click();
    await page.getByTestId('confirm-payment-btn').click({ force: true });
    await expect(page.getByTestId('table-feed')).toContainText(/paid|payment/i);

    // Win
    await loadFixture(page, 'oneSetFromWinning');
    await dragCardToZone(page, 'hand-card-db2', 'properties-drop');
    await expect(page.getByTestId('win-overlay')).toBeVisible();
    await expect(page.getByTestId('win-overlay')).toContainText(/winner/i);
  });
});
