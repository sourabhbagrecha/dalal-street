import { expect, test, type Page } from '@playwright/test';

/**
 * The `wildcardUsage` fixture seats p1 with:
 *  - `wc_dual`  — a light-blue/railroad wildcard in hand
 *  - `wc_multi` — a ten-colour wildcard in hand
 *  - `rw_wild`  — a red/yellow wildcard on the board, assigned red, and the
 *                 third card of a *complete* red set, so flipping it breaks one.
 */
async function loadFixture(page: Page, name: string) {
  await page.getByLabel('Dev scenario').selectOption(name);
}

function flipBtn(page: Page, cardId: string) {
  return page.getByTestId(`flip-wild-btn-${cardId}`);
}

/** The city shown in the card's top (right-side-up) half — the colour it is
 *  currently counting as. The bottom half is the same markup again, printed
 *  upside-down (see .playing-card__wd-half--b in PlayingCard.tsx), so the
 *  top one is whichever half lacks that modifier. */
function topHalfCity(page: Page, cardId: string) {
  return page
    .locator(
      `[data-card-id="${cardId}"] .playing-card__wd-half:not(.playing-card__wd-half--b) .playing-card__wd-city`,
    )
    .first();
}

/** The city shown in the card's bottom (upside-down) half. */
function bottomHalfCity(page: Page, cardId: string) {
  return page
    .locator(`[data-card-id="${cardId}"] .playing-card__wd-half--b .playing-card__wd-city`)
    .first();
}

test.describe('wildcard flip', () => {
  test('flipping a hand wildcard swaps which colour is on top', async ({ page }) => {
    await page.goto('/local');
    await loadFixture(page, 'wildcardUsage');

    const before = await topHalfCity(page, 'wc_dual').textContent();
    await expect(flipBtn(page, 'wc_dual')).toBeEnabled();

    await flipBtn(page, 'wc_dual').click();

    await expect(topHalfCity(page, 'wc_dual')).not.toHaveText(before ?? '');
    // The half that used to be on top is now the one printed upside-down.
    await expect(bottomHalfCity(page, 'wc_dual')).toHaveText(before ?? '');
  });

  test('the ten-colour wildcard has no flip button', async ({ page }) => {
    await page.goto('/local');
    await loadFixture(page, 'wildcardUsage');

    await expect(flipBtn(page, 'wc_dual')).toBeVisible();
    await expect(flipBtn(page, 'wc_multi')).toHaveCount(0);
  });

  test('a hand flip survives an unrelated board change', async ({ page }) => {
    await page.goto('/local');
    await loadFixture(page, 'wildcardUsage');

    await flipBtn(page, 'wc_dual').click();
    const pinned = await topHalfCity(page, 'wc_dual').textContent();

    // Rearranging a different card changes the board the seeding heuristic reads.
    // The flipped face is pinned, so it must not follow.
    await flipBtn(page, 'rw_wild').click();
    await flipBtn(page, 'rw_wild').click();
    await expect(page.getByTestId('table-feed')).toContainText(/rearranged/i);

    await expect(topHalfCity(page, 'wc_dual')).toHaveText(pinned ?? '');
  });

  test('flipping a board wildcard that breaks a set takes two taps', async ({ page }) => {
    await page.goto('/local');
    await loadFixture(page, 'wildcardUsage');

    const sets = page.locator('.property-set-view');
    await expect(sets).toHaveCount(1);

    // First tap only arms — the red set is complete, so this flip is destructive.
    await flipBtn(page, 'rw_wild').click();
    await expect(flipBtn(page, 'rw_wild')).toHaveAttribute('data-armed', 'true');
    await expect(sets).toHaveCount(1);

    // Second tap commits.
    await flipBtn(page, 'rw_wild').click();
    await expect(sets).toHaveCount(2);
    await expect(page.getByTestId('table-feed')).toContainText(/rearranged/i);
    await expect(page.getByTestId('table-feed')).toContainText(/broken|break/i);
  });

  test('an armed destructive flip is cancelled by pressing elsewhere', async ({ page }) => {
    await page.goto('/local');
    await loadFixture(page, 'wildcardUsage');

    await flipBtn(page, 'rw_wild').click();
    await expect(flipBtn(page, 'rw_wild')).toHaveAttribute('data-armed', 'true');

    await page.getByTestId('table-feed').click({ position: { x: 5, y: 5 } });

    await expect(flipBtn(page, 'rw_wild')).not.toHaveAttribute('data-armed', 'true');
    await expect(page.locator('.property-set-view')).toHaveCount(1);
  });

  test('board flip is disabled on another seat’s turn, hand flip is not', async ({ page }) => {
    await page.goto('/local');
    await loadFixture(page, 'wildcardUsage');

    // Watch p1's board and hand from seat 2, where it is not p1's turn to act.
    await page.locator('[data-seat="1"]').click();

    // Seat 2 sees none of p1's cards, so switch back and end the turn instead:
    // the point is that the badge tracks whose turn it is, not who is looking.
    await page.locator('[data-seat="0"]').click();
    await page.getByTestId('draw-pile').click();
    await page.getByTestId('end-turn-btn').click();

    // Desktop now spotlights seat 2's turn instead of showing the table
    // centre to a bystander (same as phone); check the banner from seat 2's
    // own view, then switch back to seat 1 to read seat 1's own board below.
    await page.locator('[data-seat="1"]').click();
    await expect(page.getByTestId('turn-banner')).toHaveAttribute('data-current-seat', '1');
    await page.locator('[data-seat="0"]').click();
    await expect(flipBtn(page, 'rw_wild')).toBeDisabled();
    // A hand flip sends no command, so nothing stops the player planning ahead.
    await expect(flipBtn(page, 'wc_dual')).toBeEnabled();
  });

  test('dropping a hand wildcard on a set of its other colour turns it over', async ({ page }) => {
    await page.goto('/local');
    await loadFixture(page, 'wildcardUsage');

    await page.getByTestId('draw-pile').click();

    // wc_dual is light_blue/railroad; make its face light_blue, then drop it on
    // a railroad set. The drop is unambiguous, so it re-flips rather than being
    // refused.
    const face = await topHalfCity(page, 'wc_dual').textContent();
    const railroadSetCity = 'Hampi';
    if (face === railroadSetCity) await flipBtn(page, 'wc_dual').click();

    await page.evaluate(() => {
      const card = document.querySelector('[data-card-id="wc_dual"]');
      const panel = document.querySelector('[data-testid="properties-drop"]');
      if (!card || !panel) throw new Error('drag elements missing');
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('application/x-monopoly-card', 'wc_dual');
      card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
      panel.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
      panel.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
      card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
    });

    // It left the hand and landed on the board as a property either way.
    await expect(page.locator('.hand-fan [data-card-id="wc_dual"]')).toHaveCount(0);
    await expect(page.locator('.property-set-view [data-card-id="wc_dual"]')).toHaveCount(1);
  });
});
