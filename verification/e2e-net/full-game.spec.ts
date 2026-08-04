import { test, expect } from '@playwright/test';
import {
  assertProjectionMatchesUi,
  closePlayers,
  getClientState,
  hostCreateRoom,
  joinRoom,
  openPlayers,
  postCommand,
  startGame,
} from './helpers.js';

test.describe('full multi-client game', () => {
  test('create, join x3, start, play with projection checks', async ({ browser }) => {
    const players = await openPlayers(browser, 4);
    try {
      const code = await hostCreateRoom(players[0]!);
      await joinRoom(players[1]!, code);
      await joinRoom(players[2]!, code);
      await joinRoom(players[3]!, code);

      for (const p of players) {
        await expect(p.page.getByTestId('seat-list').locator('li')).toHaveCount(4, {
          timeout: 15_000,
        });
      }

      await startGame(players[0]!);
      for (const p of players) {
        await expect(p.page.getByTestId('draw-pile')).toBeVisible({ timeout: 20_000 });
        await assertProjectionMatchesUi(p.page);
      }

      let moves = 0;
      for (let i = 0; i < 80; i++) {
        let acted = false;
        for (const p of players) {
          const decline = p.page.locator('[data-testid^="jsn-decline-btn"]');
          if (await decline.first().isVisible().catch(() => false)) {
            await decline.first().click({ timeout: 1000 }).catch(() => undefined);
            moves += 1;
            acted = true;
            break;
          }
          const draw = p.page.getByTestId('draw-btn');
          if (await draw.isVisible().catch(() => false)) {
            await draw.click();
            moves += 1;
            acted = true;
            break;
          }
          const end = p.page.getByTestId('end-turn-btn');
          if (await end.isEnabled().catch(() => false)) {
            await end.click();
            moves += 1;
            acted = true;
            break;
          }
        }
        await players[0]!.page.waitForTimeout(120);
        if (!acted) {
          // Bank a money card via adapter-backed POST using the store seq through UI drag fallback
          for (const p of players) {
            const st = await getClientState(p.page);
            if (!st || st.currentPlayerId !== st.viewerId || st.turnPhase !== 'playing') continue;
            if (st.playsRemaining <= 0) continue;
            const money = st.you.hand.find((c) => c.kind === 'money');
            if (!money) continue;
            await p.page.evaluate((cardId) => {
              const cardEl = document.querySelector(`[data-testid="hand-card-${cardId}"]`);
              const drop = document.querySelector('[data-testid="bank-drop"]');
              if (!cardEl || !drop) return;
              const dt = new DataTransfer();
              dt.setData('application/x-monopoly-card', cardEl.getAttribute('data-card-id') ?? cardId);
              cardEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
              drop.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
              drop.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
            }, money.id);
            moves += 1;
            acted = true;
            break;
          }
        }
        if (i % 10 === 0) {
          for (const p of players) await assertProjectionMatchesUi(p.page);
        }
      }

      expect(moves).toBeGreaterThan(5);
      // Termination across the network transport is gated by verification/netSim.ts.
    } finally {
      await closePlayers(players);
    }
  });
});
