import { test, expect } from '@playwright/test';
import {
  closePlayers,
  getClientState,
  hostCreateRoom,
  joinRoom,
  openPlayers,
  startGame,
} from './helpers.js';

test.describe('interrupt flows', () => {
  test('multi-seat game stays responsive through draws and end turns', async ({ browser }) => {
    const players = await openPlayers(browser, 4);
    try {
      const code = await hostCreateRoom(players[0]!);
      for (let i = 1; i < 4; i++) await joinRoom(players[i]!, code);
      await startGame(players[0]!);

      // `hand-fan`, not `draw-pile` — every seat's own hand is always on
      // screen regardless of whose turn it is, but draw-pile only renders for
      // whoever's acting (everyone else sees the opponent spotlight instead).
      for (const p of players) {
        await expect(p.page.getByTestId('hand-fan')).toBeVisible({ timeout: 20_000 });
      }

      // Host draws if possible
      const draw = players[0]!.page.getByTestId('draw-btn');
      if (await draw.isVisible().catch(() => false)) {
        await draw.click();
      }

      // Decline any JSN that appears on other seats
      for (const p of players) {
        const decline = p.page.getByTestId('jsn-decline-btn');
        if (await decline.isVisible().catch(() => false)) {
          await decline.click();
        }
      }

      for (const p of players) {
        const st = await getClientState(p.page);
        expect(st?.you.hand.length).toBeGreaterThan(0);
        expect(st?.players.every((x) => typeof x.handCount === 'number')).toBe(true);
      }
    } finally {
      await closePlayers(players);
    }
  });
});
