import { expect, test } from '@playwright/test';
import { clickHandCard } from './helpers/dnd';
import { openDemo, switchSeat } from './helpers/demo';

/**
 * The hand stays interactive through a rival's turn (table/felt/useHandDrag.ts, table/felt/pills.ts): every card
 * can still be inspected and tapped to preview what it would do — all purely local, so waiting on someone else is
 * not just watching a dimmed hand. None of it can commit a play: the preview
 * pills a tap opens are disabled outside the viewer's own turn, and `onDrop` never reaches the server either.
 * Committing a real play is covered by the other felt specs; this one owns the waiting experience itself.
 */
test.describe('hand interactivity on a rival’s turn', () => {
  test('a tapped card lifts with no play pills', async ({ page }) => {
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

    // A tap lifts the card to read it, but a rival's turn offers no play options at all.
    await clickHandCard(page, 'hand-card-jsn1');
    await expect(page.getByTestId('hand-card-jsn1')).toHaveAttribute('data-sel', 'true');
    await expect(page.locator('.tb-pills')).toHaveCount(0);
  });
});
