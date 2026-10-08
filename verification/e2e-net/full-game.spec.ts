import { test, expect } from '@playwright/test';
import {
  assertProjectionMatchesUi,
  closePlayers,
  getClientState,
  hostCreateRoom,
  joinRoom,
  openPlayers,
  startGame,
} from './helpers.js';
import { clickHandCard, dragCardToZone } from '../e2e/helpers/dnd.js';

test.describe('full multi-client game', () => {
  test('create, join x3, start, play with projection checks', async ({ browser }) => {
    const players = await openPlayers(browser, 4);
    try {
      // The round buttons throb forever (tb-throb), and Playwright never sees a moving box as stable, so a click on
      // DISCARD would wait out its whole timeout. The app drops every table animation under reduced motion.
      for (const p of players) await p.page.emulateMedia({ reducedMotion: 'reduce' });
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
      // `hand-fan`, not `draw-pile` — always on screen for every seat, unlike
      // draw-pile which only renders for whoever's currently acting.
      for (const p of players) {
        await expect(p.page.getByTestId('hand-fan')).toBeVisible({ timeout: 20_000 });
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
            // Bounded like the rest: the button can go (drawn, or the turn moved on) between the check and the press.
            await draw.click({ timeout: 5000 }).catch(() => undefined);
            moves += 1;
            acted = true;
            break;
          }
          // Nobody plays much, so hands outgrow the limit within a round and
          // END TURN parks on the hand-limit prompt (which also dims the table,
          // END TURN with it) until the excess is discarded.
          const discardPrompt = p.page.getByTestId('hand-limit-prompt');
          if (await discardPrompt.isVisible().catch(() => false)) {
            const st = await getClientState(p.page);
            const top = st?.pendingStack[st.pendingStack.length - 1];
            if (st && top?.kind === 'hand_limit_discard' && top.playerId === st.viewerId) {
              // DISCARD only shows once enough are picked, and a tap toggles: pick only while it is missing, or a
              // pass that follows a slow confirm would un-pick what the last one marked.
              const confirm = p.page.getByTestId('confirm-discard-btn');
              if (!(await confirm.isVisible().catch(() => false))) {
                // Hand cards answer the table's pointer gesture, not a bare click: a press with no movement picks one.
                for (const c of st.hand.slice(0, top.excess)) await clickHandCard(p.page, `hand-card-${c.id}`);
              }
              await confirm.click({ timeout: 5000 }).catch(() => undefined);
              moves += 1;
              acted = true;
              break;
            }
          }
          // END TURN lives on the viewer's own staged seat, which only exists
          // while that seat is acting. isEnabled() waits for a missing element
          // (forever, here), so check it is on screen first.
          const end = p.page.getByTestId('end-turn-btn');
          if (
            (await end.isVisible().catch(() => false)) &&
            (await end.isEnabled().catch(() => false))
          ) {
            await end.click({ timeout: 5000 }).catch(() => undefined);
            moves += 1;
            acted = true;
            break;
          }
        }
        await players[0]!.page.waitForTimeout(120);
        if (!acted) {
          // Bank a money card: drag it onto your own table, which is the bank's drop zone too.
          for (const p of players) {
            const st = await getClientState(p.page);
            if (!st || st.currentPlayerId !== st.viewerId || st.turnPhase !== 'playing') continue;
            if (st.playsRemaining <= 0) continue;
            const money = st.hand.find((c) => c.kind === 'money');
            if (!money) continue;
            await dragCardToZone(p.page, `hand-card-${money.id}`, 'properties-drop').catch(() => undefined);
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
