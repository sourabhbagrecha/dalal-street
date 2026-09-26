import { expect, test, type Page } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';
import { openDemo, switchSeat } from './helpers/demo';

/**
 * /demo renders server projections, so each seat only ever sees its own
 * payment prompt (table/live/prompts.ts `roundPrompt` picks the viewer's entry
 * out of the round). "All at once" = every payer's prompt is open
 * simultaneously in the same round: switch through the payer seats without
 * anyone paying, and each one is asked. The payee, meanwhile, is told who they
 * are waiting on and is never asked to pay.
 */
async function expectPayersPromptedAtOnce(page: Page, seats: number[]) {
  // The payee (Aarav, seat 0) sees the round's status in the HUD, not a prompt of their own.
  await expect(page.getByTestId('turn-banner')).toContainText(/Waiting on .* to pay/i);
  await expect(page.getByTestId('payment-prompt')).toHaveCount(0);

  for (const seat of seats) {
    // 0-based seat index: 1 = p2 = Priya … 3 = p4 = Yuki.
    await switchSeat(page, seat);
    // Exactly one prompt — the viewer's own — naming the payee.
    const prompt = page.getByTestId('payment-prompt');
    await expect(prompt).toHaveCount(1);
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(/^Pay /);
    await expect(prompt).toContainText(/to Aarav/);
    await expect(page.getByTestId('confirm-payment-btn')).toBeVisible();
  }
}

test.describe('parallel payment', () => {
  test('dual rent shows payment prompts for all opponents at once', async ({ page }) => {
    await openDemo(page, 'parallelRentCollection');

    await dragCardToZone(page, 'hand-card-rent_brown_lb', 'discard-drop');
    await expectPayersPromptedAtOnce(page, [1, 2, 3]);
  });

  test('birthday shows payment prompts for all opponents at once', async ({ page }) => {
    await openDemo(page, 'parallelBirthdayCollection');

    await dragCardToZone(page, 'hand-card-bd1', 'discard-drop');
    // The round is the same one the dual rent opens; the last seat being asked
    // while nobody has paid is enough to prove it opened for everyone.
    await expectPayersPromptedAtOnce(page, [3]);
  });
});
