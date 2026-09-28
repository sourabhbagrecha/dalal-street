import { expect, test } from '@playwright/test';
import { clickHandCard } from './helpers/dnd';
import { openDemo, switchSeat } from './helpers/demo';

/**
 * The hand stays interactive through a rival's turn (table/felt/useHandDrag.ts, table/felt/pills.ts): every card
 * can still be inspected and tapped to preview what it would do, and the tray can still be regrouped — all purely
 * local, so waiting on someone else is not just watching a dimmed hand. None of it can commit a play: the preview
 * pills a tap opens are disabled outside the viewer's own turn, and `onDrop` never reaches the server either.
 * Committing a real play is covered by the other felt specs; this one owns the waiting experience itself.
 */
test.describe('hand interactivity on a rival’s turn', () => {
  test('a tapped card previews its (disabled) pills, and the sort toggle regroups the hand', async ({ page }) => {
    // standardMidGame: Aarav (p1) has the turn; Priya (p2) holds a Just Say No and a ₹1.
    await openDemo(page, 'standardMidGame');
    await switchSeat(page, 1);

    // Switching /demo's rendered seat drops the old seat's SSE session (it reads as disconnected, same as a real
    // seat that left) — the point here is only that it is Aarav's turn, not the viewer's.
    await expect(page.getByTestId('turn-banner')).toContainText(/Aarav/);
    await expect(page.getByTestId('turn-banner')).not.toContainText(/your turn/i);

    const cards = page.locator('[data-testid^="hand-card-"]');
    await expect(cards).toHaveCount(2);
    // As dealt: the Just Say No first, then the ₹1 note.
    await expect(cards.nth(0)).toHaveAttribute('data-testid', 'hand-card-jsn1');
    await expect(cards.nth(1)).toHaveAttribute('data-testid', 'hand-card-m2');

    // A tap lifts the card and previews what it could do — Just Say No only ever banks — but every pill it shows
    // is disabled: nothing here is a play the server would ever see.
    await clickHandCard(page, 'hand-card-jsn1');
    await expect(page.getByTestId('hand-card-jsn1')).toHaveAttribute('data-sel', 'true');
    await expect(page.getByTestId('hand-preview-hint')).toBeVisible();
    const previewPill = page.locator('.tb-pills button');
    await expect(previewPill).toHaveCount(1);
    await expect(previewPill).toContainText(/Bank/i);
    await expect(previewPill).toBeDisabled();

    // Sort groups by kind — money first — a purely local reordering of the same two cards, nothing sent anywhere.
    await page.getByTestId('hand-sort-btn').click();
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveAttribute('data-testid', 'hand-card-m2');
    await expect(cards.nth(1)).toHaveAttribute('data-testid', 'hand-card-jsn1');

    // Toggling back restores the dealt order.
    await page.getByTestId('hand-sort-btn').click();
    await expect(cards.nth(0)).toHaveAttribute('data-testid', 'hand-card-jsn1');
    await expect(cards.nth(1)).toHaveAttribute('data-testid', 'hand-card-m2');
  });
});
