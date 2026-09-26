import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';
import { openDemo } from './helpers/demo';

/** The viewer's bank tile (its label counts the cards). CashPile inside it carries the same test id, so take the outer one. */
const bankTile = (page: import('@playwright/test').Page) => page.getByTestId('bank-drop').first();

/**
 * The confirmations the felt table holds a play behind (table/Confirms.tsx):
 * a sheet over the dimmed table with the card in question above it. Backing
 * out sends nothing — the card simply stays where it was — and every "yes"
 * is the same command the drop would have sent.
 *
 *   action-bank      an action card dropped on the bank: keep / cash / play
 *   rent-double      a rent card played with an unplayed Double the Rent in hand
 *   wasted-play      a legal play that gains nothing (wasted-play.spec.ts)
 *   flip             the on-board "flip to other colour" pill on a wild, when
 *                    the flip would break a complete set
 *
 * building-choice (a House/Hotel dropped on the bank) has no coverage here: no
 * engine fixture (packages/engine/src/fixtures.ts) puts a House or Hotel in
 * the acting player's hand — every building in a fixture is already on a set.
 * Add a fixture rather than hunting one out of a random deal.
 */
test.describe('action card dropped on the bank', () => {
  test.beforeEach(async ({ page }) => {
    // standardMidGame: Aarav holds Pass Go (pg1) and a bank of two cards.
    await openDemo(page, 'standardMidGame');
    await expect(bankTile(page)).toContainText('2 cards');
    await dragCardToZone(page, 'hand-card-pg1', 'bank-drop');
    await expect(page.getByTestId('action-bank-prompt')).toBeVisible();
    await expect(page.getByTestId('action-bank-prompt')).toContainText(/Pass Go/i);
  });

  test('Keep in hand sends nothing; dropped again, Add to Cash banks it for its value', async ({ page }) => {
    await page.getByTestId('action-bank-keep-btn').click();

    await expect(page.getByTestId('action-bank-prompt')).toBeHidden();
    await expect(page.getByTestId('hand-card-pg1')).toBeVisible();
    await expect(bankTile(page)).toContainText('2 cards');
    await expect(page.getByTestId('turn-banner')).toContainText('3 plays left');

    await dragCardToZone(page, 'hand-card-pg1', 'bank-drop');
    await page.getByTestId('action-bank-cash-btn').click();

    await expect(page.getByTestId('action-bank-prompt')).toBeHidden();
    await expect(page.getByTestId('hand-card-pg1')).toHaveCount(0);
    await expect(bankTile(page)).toContainText('3 cards');
    await expect(page.getByTestId('table-feed')).toContainText(/banked/i);
  });

  test('Play it plays the action instead', async ({ page }) => {
    await page.getByTestId('action-bank-play-btn').click();

    await expect(page.getByTestId('action-bank-prompt')).toBeHidden();
    await expect(page.getByTestId('hand-card-pg1')).toHaveCount(0);
    await expect(page.getByTestId('table-feed')).toContainText(/passed go/i);
    // Four in hand, minus Pass Go, plus the two it draws.
    await expect(page.locator('[data-testid^="hand-card-"]')).toHaveCount(5);
    await expect(bankTile(page)).toContainText('2 cards');
  });
});

test.describe('rent with Double the Rent in hand', () => {
  test.beforeEach(async ({ page }) => {
    // doubleRentCombo: Aarav holds Double the Rent (dbl1) and a red rent (r1) over a red set.
    await openDemo(page, 'doubleRentCombo');
    await dragCardToZone(page, 'hand-card-r1', 'discard-drop');
    await expect(page.getByTestId('rent-double-prompt')).toBeVisible();
  });

  test('Undo keeps both cards; dropped again, Just Play Rent charges the rent alone and keeps the Double', async ({
    page,
  }) => {
    await page.getByTestId('rent-double-cancel-btn').click();

    await expect(page.getByTestId('rent-double-prompt')).toBeHidden();
    await expect(page.getByTestId('hand-card-r1')).toBeVisible();
    await expect(page.getByTestId('hand-card-dbl1')).toBeVisible();
    await expect(page.getByTestId('turn-banner')).toContainText('3 plays left');

    await dragCardToZone(page, 'hand-card-r1', 'discard-drop');
    await page.getByTestId('rent-double-plain-btn').click();

    await expect(page.getByTestId('rent-double-prompt')).toBeHidden();
    await expect(page.getByTestId('hand-card-r1')).toHaveCount(0);
    await expect(page.getByTestId('hand-card-dbl1')).toBeVisible();
    await expect(page.getByTestId('table-feed')).toContainText(/rent/i);
    await expect(page.getByTestId('table-feed')).not.toContainText(/Double the Rent \(x/);
  });

  test('Double the Rent plays the Double first, then the rent', async ({ page }) => {
    await page.getByTestId('rent-double-confirm-btn').click();

    await expect(page.getByTestId('rent-double-prompt')).toBeHidden();
    await expect(page.getByTestId('hand-card-dbl1')).toHaveCount(0);
    await expect(page.getByTestId('hand-card-r1')).toHaveCount(0, { timeout: 8000 });
    await expect(page.getByTestId('table-feed')).toContainText(/Double the Rent \(x1\)/);
    // Everyone else now owes the doubled rent (Priya may Just Say No first).
    await expect(page.getByTestId('turn-banner')).toContainText(/Just Say No|Waiting on .* to pay/i);
  });
});

test.describe('flipping a wild on the table', () => {
  test('the flip pill asks before breaking a complete set; Undo keeps it, Flip it moves it', async ({ page }) => {
    // wildcardUsage: Aarav's complete red set holds a red/yellow wild (rw_wild) played as red.
    await openDemo(page, 'wildcardUsage');

    const redSet = page.locator('[data-testid="self-stage"] .tb-set[data-color="red"]');
    await expect(redSet).toHaveAttribute('data-complete', 'true');
    await expect(redSet.locator('[data-cid="rw_wild"]')).toBeVisible();

    // A tap on the wild offers its other colour as a pill over the tray.
    await page.getByTestId('board-card-rw_wild').click();
    const pill = page.getByTestId('flip-wild-btn-rw_wild');
    await expect(pill).toBeVisible();
    await expect(pill).toContainText(/breaks a set/i);

    await pill.click();
    const prompt = page.getByTestId('flip-prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(/breaks the set/i);
    await page.getByTestId('flip-prompt-undo-btn').click();
    await expect(prompt).toBeHidden();
    await expect(redSet.locator('[data-cid="rw_wild"]')).toBeVisible();
    await expect(redSet).toHaveAttribute('data-complete', 'true');

    // Flip it: a REARRANGE_PROPERTY over the wire; the wild starts a yellow set.
    await page.getByTestId('board-card-rw_wild').click();
    await page.getByTestId('flip-wild-btn-rw_wild').click();
    await page.getByTestId('flip-prompt-confirm-btn').click();
    await expect(page.getByTestId('flip-prompt')).toBeHidden();

    const yellowSet = page.locator('[data-testid="self-stage"] .tb-set[data-color="yellow"]');
    await expect(yellowSet.locator('[data-cid="rw_wild"]')).toBeVisible();
    await expect(redSet.locator('[data-cid="rw_wild"]')).toHaveCount(0);
    await expect(redSet).toHaveAttribute('data-complete', 'false');
    await expect(redSet).toContainText('2/3');
  });
});
