import { test, expect } from '@playwright/test';
import { closePlayers, getClientState, hostCreateRoom, joinRoom, openPlayers, startGame } from './helpers.js';

/**
 * Table reactions over a real room: a face one seat throws reaches every other seat through the room's SSE stream and
 * lands over the thrower's seat with their name under it. The thrower sees their own face at once, and only once —
 * the room's echo of it is skipped.
 */
test.describe('table reactions', () => {
  test('a reaction reaches the other seat, over the thrower’s seat', async ({ browser }) => {
    const players = await openPlayers(browser, 2);
    try {
      const code = await hostCreateRoom(players[0]!);
      await joinRoom(players[1]!, code);
      await startGame(players[0]!);
      for (const p of players) {
        await expect(p.page.getByTestId('hand-fan')).toBeVisible({ timeout: 20_000 });
      }

      const thrower = players[1]!.page;
      const watcher = players[0]!.page;
      const throwerId = (await getClientState(thrower))!.viewerId;

      await thrower.getByTestId('reaction-btn').click();
      await thrower.getByTestId('reaction-laugh').click();

      // The thrower: straight away, and exactly one.
      await expect(thrower.getByTestId(`reaction-burst-${throwerId}`)).toHaveCount(1);

      // Everyone else: over the thrower's seat, with the thrower's name.
      const seen = watcher.getByTestId(`reaction-burst-${throwerId}`);
      await expect(seen).toBeVisible({ timeout: 10_000 });
      await expect(seen).toHaveAttribute('data-reaction', 'laugh');
      await expect(seen).toContainText(players[1]!.name);

      // Still just the one on the thrower's screen once the echo has come and gone.
      await watcher.waitForTimeout(500);
      await expect(thrower.getByTestId(`reaction-burst-${throwerId}`)).toHaveCount(1);
    } finally {
      await closePlayers(players);
    }
  });
});
