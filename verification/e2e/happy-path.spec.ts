import { expect, test } from '@playwright/test';
import { switchSeat } from './helpers/demo';
import { dragCardToZone } from './helpers/dnd';

test.describe('happy path', () => {
  test('seat1 banks money, ends turn, seat2 is current and draws', async ({ page }) => {
    await page.goto('/demo');
    // /demo's default scenario (standardMidGame) lands mid-turn: seat 1 has
    // already drawn, so the turn goes straight to playing cards. Drawing is
    // automatic at the start of a turn now (no draw-pile click), which this
    // test covers on seat 2's side below.
    await expect(page.getByTestId('hand-fan')).toBeVisible();
    // The HUD line names whose turn it is by seat id; the viewer's own seat is p1.
    await expect(page.getByTestId('turn-banner')).toHaveAttribute('data-turn-id', 'p1');
    await expect(page.getByTestId('self-stage')).toHaveAttribute('data-seat', 'p1');

    await dragCardToZone(page, 'hand-card-m1', 'bank-drop');
    await expect(page.getByTestId('bank-drop').locator('[data-card-id="m1"]')).toBeVisible();
    await expect(page.getByTestId('hand-card-m1')).toHaveCount(0);
    await expect(page.getByTestId('table-feed')).toContainText(/bank/i);

    await page.getByTestId('end-turn-btn').click();
    await expect(page.getByTestId('table-feed')).toContainText(/turn/i);

    // Seat 2's own view: their turn starts, the draw happens on its own, and
    // the viewer's own END TURN control is theirs now.
    await switchSeat(page, 1);
    await expect(page.getByTestId('turn-banner')).toHaveAttribute('data-turn-id', 'p2');
    await expect(page.getByTestId('self-stage')).toHaveAttribute('data-seat', 'p2');
    await expect(page.getByTestId('end-turn-btn')).toBeVisible();
    await expect(page.getByTestId('table-feed')).toContainText(/drew/i);
    // standardMidGame deals seat 2 two cards; the turn-start draw adds two.
    await expect(page.locator('[data-testid^="hand-card-"]')).toHaveCount(4);
  });
});
