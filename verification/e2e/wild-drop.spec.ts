import { expect, test } from '@playwright/test';
import { openDemo } from './helpers/demo';
import { dragCardToSelector } from './helpers/dnd';

/**
 * A two-colour wild dropped on a set of a colour it does not show used to be refused ("Can’t be that colour").
 * It is never refused now: the table asks which of its two colours to lay it as, and a colour with no set under way
 * starts a new set of its own.
 */
test.describe('dropping a wild on a set it cannot join', () => {
  test('asks which colour, then starts a new set', async ({ page }) => {
    // wildcardUsage: Aarav holds a light blue/pink wild (wc_dual); his only set is a complete red one.
    await openDemo(page, 'wildcardUsage');

    const red = '[data-testid="self-stage"] .tb-set[data-zone="build"][data-color="red"]';
    await expect(page.locator(red)).toHaveCount(1);
    await dragCardToSelector(page, 'hand-card-wc_dual', red);

    const ask = page.getByTestId('wild-ask');
    await expect(ask).toBeVisible();
    await expect(page.getByTestId('wild-ask-light_blue')).toContainText('new set');
    await expect(page.getByTestId('wild-ask-pink')).toContainText('new set');
    expect(await page.getByTestId('toast-rejected').allTextContents()).toEqual([]);

    await page.getByTestId('wild-ask-pink').click();
    await expect(ask).toBeHidden();
    await expect(page.locator('[data-testid="self-stage"] .tb-set[data-color="pink"] [data-cid="wc_dual"]')).toHaveCount(1);
    await expect(page.locator(red)).toHaveAttribute('data-complete', 'true');
    await expect(page.getByTestId('turn-banner')).toContainText('2 plays left');
  });
});
