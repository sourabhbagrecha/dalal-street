import { expect, test } from '@playwright/test';

/**
 * A hand card dropped *onto an existing set* (rather than the empty part of
 * the properties panel) used to be played twice: the set's drop handler fell
 * through to the panel's handler, and then the same event bubbled up to the
 * panel's own listener. The second PLAY_CARD hit the engine after the card
 * had already left the hand, producing a "Card not in hand" toast and a
 * rejection shake on every ordinary property drop.
 */
test.describe('dropping a hand card on a set', () => {
  test('plays it once, with no rejection toast or shake', async ({ page }) => {
    await page.goto('/local');
    await page.getByLabel('Dev scenario').selectOption('wildcardUsage');
    await page.getByTestId('draw-pile').click();

    // wc_multi is the ten-colour wild: not flippable, so a set drop takes the
    // generic fall-through path into the panel's hand-drop handler.
    await page.evaluate(() => {
      const card = document.querySelector('[data-card-id="wc_multi"]');
      const set = document.querySelector('.property-set-view');
      if (!card || !set) throw new Error('drag elements missing');
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('application/x-monopoly-card', 'wc_multi');
      card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
      set.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
      set.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
      card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
    });

    // The rejection toast clears itself after ~3s, so sample it once shortly
    // after the drop rather than with a retrying assertion that would simply
    // wait it out.
    await page.waitForTimeout(300);
    expect(await page.getByTestId('toast-rejected').allTextContents()).toEqual([]);
    expect(await page.getByTestId('properties-drop').getAttribute('class')).not.toContain(
      'drop-zone--shake',
    );

    await expect(page.locator('.hand-fan [data-card-id="wc_multi"]')).toHaveCount(0);
    await expect(page.locator('.property-set-view [data-card-id="wc_multi"]')).toHaveCount(1);
    // Exactly one play consumed from the turn's three.
    await expect(page.getByLabel('2 plays remaining')).toBeVisible();
  });
});
