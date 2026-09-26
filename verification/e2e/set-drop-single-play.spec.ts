import { expect, test } from '@playwright/test';
import { loadFixture } from './helpers/demo';
import { dragCardToSelector } from './helpers/dnd';

/**
 * A hand card dropped *onto an existing set* (rather than the empty part of
 * the viewer's seat) used to be played twice: the set's drop handler fell
 * through to the panel's handler, and then the same event bubbled up to the
 * panel's own listener. The second PLAY_CARD hit the engine after the card
 * had already left the hand, producing a "Card not in hand" toast and a
 * rejection shake on every ordinary property drop. On the felt table a set
 * tile is a `data-zone="build"` target inside the seat's `data-zone="auto"`,
 * so the same fall-through is possible in principle.
 */
test.describe('dropping a hand card on a set', () => {
  test('plays it once, with no rejection toast', async ({ page }) => {
    await page.goto('/demo');
    // standardMidGame: Aarav holds a red property (pr1); his orange set is still open (2/3).
    await loadFixture(page, 'standardMidGame');

    // A plain property builds its own colour wherever it lands, so dropping the
    // red card on the orange tile is a legal, ordinary play: one PLAY_CARD.
    const orange = '[data-testid="self-stage"] .tb-set[data-zone="build"][data-color="orange"]';
    await expect(page.locator(orange)).toHaveCount(1);
    await dragCardToSelector(page, 'hand-card-pr1', orange);

    // The rejection toast clears itself after ~3s, so sample it once shortly
    // after the drop rather than with a retrying assertion that would simply
    // wait it out.
    await page.waitForTimeout(300);
    expect(await page.getByTestId('toast-rejected').allTextContents()).toEqual([]);

    await expect(page.locator('[data-testid="hand-fan"] [data-cid="pr1"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="self-stage"] .tb-set[data-color="red"] [data-cid="pr1"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="self-stage"] [data-cid="pr1"]')).toHaveCount(1);
    // Exactly one play consumed from the turn's three.
    await expect(page.getByTestId('turn-banner')).toContainText('2 plays left');
    await page.waitForTimeout(300);
    expect(await page.getByTestId('toast-rejected').allTextContents()).toEqual([]);
  });
});
