/**
 * Advanced settings: the host picks them on the home screen, can still change them in the waiting
 * room, every seat sees the same choice, and the table that is dealt wears it (no turn clock, the
 * chosen property names and currency).
 */
import { test, expect } from '@playwright/test';
import { themedPropertyName } from '@monopoly-deal/shared';
import { closePlayers, getClientState, hostCreateRoom, joinRoom, openPlayers, startGame } from './helpers.js';

test.describe('advanced settings', () => {
  test('the host’s settings reach every seat and the dealt table', async ({ browser }) => {
    const players = await openPlayers(browser, 2);
    const [host, guest] = [players[0]!, players[1]!];
    try {
      // Home screen: the defaults are what the game has always used.
      await host.page.goto('/');
      const opener = host.page.getByTestId('advanced-settings-btn');
      await expect(opener).toContainText('60s');
      await opener.click();
      const sheet = host.page.getByTestId('settings-sheet');
      await expect(sheet.getByTestId('setting-turn-60')).toHaveAttribute('aria-pressed', 'true');
      await expect(sheet.getByTestId('setting-properties-india')).toHaveAttribute('aria-pressed', 'true');
      // Currency has no control of its own: it follows the property theme.
      await expect(sheet.getByTestId('setting-currency-INR')).toHaveCount(0);

      await sheet.getByTestId('setting-turn-30').click();
      await sheet.getByTestId('setting-properties-europe').click();
      await host.page.keyboard.press('Escape');
      await expect(opener).toContainText('30s');
      await expect(opener).toContainText('Europe');

      // The room is created with them, and a guest reads the same thing but cannot change it.
      const code = await hostCreateRoom(host);
      const hostRow = host.page.getByTestId('room-settings');
      await expect(hostRow).toContainText('30s');
      await expect(hostRow).toContainText('Europe');
      await expect(hostRow).toContainText('€');

      await joinRoom(guest, code);
      const guestRow = guest.page.getByTestId('room-settings');
      await expect(guestRow).toContainText('Europe');
      await guestRow.click();
      const guestSheet = guest.page.getByTestId('settings-sheet');
      await expect(guestSheet.getByTestId('setting-properties-europe')).toHaveAttribute('aria-pressed', 'true');
      await expect(guestSheet.getByTestId('setting-turn-none')).toBeDisabled();
      await guest.page.keyboard.press('Escape');

      // The host changes their mind in the waiting room; the guest's row follows.
      await hostRow.click();
      await host.page.getByTestId('settings-sheet').getByTestId('setting-turn-none').click();
      await expect(guestRow).toContainText('No timer', { timeout: 10_000 });
      await host.page.keyboard.press('Escape');

      await startGame(host);
      for (const p of players) {
        await expect(p.page.getByTestId('hand-fan')).toBeVisible({ timeout: 20_000 });
        const state = await getClientState(p.page);
        expect(state).toBeTruthy();
        // No timer: the projection carries no turn deadline at all.
        expect(state!.deadlines?.turnMs).toBeUndefined();

        // The hand is drawn in the room's currency and property names, whoever is looking.
        await expect(p.page.getByTestId('hand-fan')).not.toContainText('₹');
        for (const card of state!.hand) {
          if (card.kind !== 'property') continue;
          await expect(p.page.getByTestId(`hand-card-${card.id}`)).toContainText(themedPropertyName('europe', card), {
            ignoreCase: true,
          });
        }
      }
    } finally {
      await closePlayers(players);
    }
  });
});
