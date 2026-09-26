import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';
import { loadFixture, switchSeat } from './helpers/demo';

test.describe('rent flow', () => {
  test('play rent from hand then pay on opponent seat', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'standardMidGame');

    await dragCardToZone(page, 'hand-card-pr1', 'properties-drop');
    // Every play is a server round trip on /demo — let the property land
    // before playing the rent, or the second drop races the first.
    await expect(page.getByTestId('hand-card-pr1')).toHaveCount(0);
    await dragCardToZone(page, 'hand-card-r1', 'discard-drop');
    await expect(page.getByTestId('hand-card-r1')).toHaveCount(0);

    // /demo shows each seat only its own prompts: switch to Priya (p2), who
    // first gets a Just Say No window (she holds jsn1), then her payment. In a
    // multi-payer round the alert's buttons carry the payer's id.
    await switchSeat(page, 1);
    await page.getByTestId('jsn-decline-btn-p2').click();

    // The payment is the tray itself: one prompt, for the viewer.
    const prompt = page.getByTestId('payment-prompt');
    await expect(prompt).toBeVisible({ timeout: 8000 });
    await expect(prompt).toContainText(/Aarav/);
    await page.getByTestId('payment-card-mb3').click();
    await page.getByTestId('confirm-payment-btn').click({ force: true });

    await expect(prompt).toBeHidden({ timeout: 8000 });
    await expect(page.getByTestId('table-feed')).toContainText(/payment|paid|rent/i);
  });

  test('payment breaks completed set from fixture', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'payBreaksCompletedSet');

    await switchSeat(page, 1);
    await expect(page.getByTestId('payment-prompt')).toBeVisible();

    // A card that would break a complete set says so on its button.
    await expect(page.getByTestId('payment-card-gg1')).toHaveAttribute('data-breaks', 'true');
    await expect(page.getByTestId('payment-card-tiny')).not.toHaveAttribute('data-breaks', 'true');
    await page.getByTestId('payment-card-gg1').click();
    await page.getByTestId('payment-card-tiny').click();
    await expect(page.getByTestId('payment-card-gg1')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('confirm-payment-btn').click({ force: true });

    await expect(page.getByTestId('table-feed')).toContainText(/green set broke/i);
  });
});
