/**
 * Rooms live at /rooms/:code — a refresh, a fresh tab and an invite link all
 * land the player back in their seat (store/session.ts + pages/RoomPage.tsx).
 */
import { test, expect } from '@playwright/test';
import {
  closePlayers,
  getClientState,
  hostCreateRoom,
  joinRoom,
  openPlayers,
  startGame,
  type NetPlayer,
} from './helpers.js';

test.describe('room URLs', () => {
  test('creating a room navigates to /rooms/:code and a refresh keeps the seat', async ({ browser }) => {
    const players = await openPlayers(browser, 2);
    try {
      const code = await hostCreateRoom(players[0]!);
      await expect(players[0]!.page).toHaveURL(new RegExp(`/rooms/${code}$`));

      await joinRoom(players[1]!, code);
      await expect(players[1]!.page).toHaveURL(new RegExp(`/rooms/${code}$`));

      await startGame(players[0]!);
      for (const p of players) {
        await expect(p.page.getByTestId('hand-fan')).toBeVisible({ timeout: 20_000 });
      }
      const before = await getClientState(players[1]!.page);
      expect(before).toBeTruthy();

      // Refresh mid-game: same URL, same seat, same hand.
      await players[1]!.page.reload();
      await expect(players[1]!.page).toHaveURL(new RegExp(`/rooms/${code}$`));
      await expect(players[1]!.page.getByTestId('hand-fan')).toBeVisible({ timeout: 20_000 });
      await expect
        .poll(async () => (await getClientState(players[1]!.page))?.viewerId, { timeout: 10_000 })
        .toBe(before!.viewerId);
      const after = await getClientState(players[1]!.page);
      expect(after!.you.hand.map((c) => c.id).sort()).toEqual(before!.you.hand.map((c) => c.id).sort());

      // The other seat saw the reconnect, not a new player.
      await expect
        .poll(
          async () =>
            (await getClientState(players[0]!.page))?.players.find((p) => p.id === before!.viewerId)
              ?.connected,
          { timeout: 10_000 },
        )
        .toBe(true);

      // A brand-new tab in the same browser finds the seat via localStorage.
      const tab = await players[1]!.context.newPage();
      await tab.goto(`/rooms/${code}`);
      await expect(tab.getByTestId('hand-fan')).toBeVisible({ timeout: 20_000 });
      await expect
        .poll(async () => (await getClientState(tab))?.viewerId, { timeout: 10_000 })
        .toBe(before!.viewerId);
      await tab.close();
    } finally {
      await closePlayers(players);
    }
  });

  test('an invite link offers a join form to a visitor without a seat', async ({ browser }) => {
    const players = await openPlayers(browser, 2);
    try {
      const code = await hostCreateRoom(players[0]!);
      await expect(players[0]!.page.getByTestId('invite-link')).toContainText(`/rooms/${code}`);

      const guest = players[1]!;
      await guest.page.goto(`/rooms/${code.toLowerCase()}`);
      await expect(guest.page.getByTestId('invite-code')).toHaveText(code, { timeout: 15_000 });
      await guest.page.getByTestId('display-name-input').fill(guest.name);
      await guest.page.getByTestId('join-room-btn').click();

      await expect(guest.page.getByTestId('room-code')).toHaveText(code, { timeout: 20_000 });
      await expect(players[0]!.page.getByTestId('seat-list')).toContainText(guest.name, {
        timeout: 10_000,
      });
    } finally {
      await closePlayers(players);
    }
  });

  test('a room that no longer exists explains itself instead of reconnecting forever', async ({ browser }) => {
    const players = await openPlayers(browser, 1);
    try {
      const page = players[0]!.page;
      const code = await hostCreateRoom(players[0]!);
      // Leaving as the only seat deletes the room server-side.
      await page.getByRole('button', { name: /leave room/i }).click();
      await expect(page.getByTestId('create-room-btn')).toBeVisible({ timeout: 10_000 });

      await page.goto(`/rooms/${code}`);
      await expect(page.getByTestId('join-room-btn')).toBeVisible({ timeout: 15_000 });
      await page.getByTestId('display-name-input').fill('Ghost');
      await page.getByTestId('join-room-btn').click();
      await expect(page.getByTestId('lobby-error')).toContainText(/not found/i, { timeout: 10_000 });
    } finally {
      await closePlayers(players);
    }
  });

  test('commands still apply after a refresh (seq counter survives the reload)', async ({ browser }) => {
    // The server drops any seq at or below the last one it applied for a seat
    // and answers a replayed seq with a silent `duplicate` ack. A reloaded page
    // that restarted counting at 0 had its auto-draw and END TURN swallowed —
    // the seat looked stuck with a greyed-out END TURN until the counter had
    // climbed past everything the previous page had sent.
    const players = await openPlayers(browser, 2);
    try {
      const code = await hostCreateRoom(players[0]!);
      await joinRoom(players[1]!, code);
      await startGame(players[0]!);

      // Whoever is up auto-drew: that seat has already applied seq 0.
      let current: NetPlayer | undefined;
      await expect
        .poll(async () => {
          for (const p of players) {
            const s = await getClientState(p.page);
            if (s && s.currentPlayerId === s.viewerId && s.drawnThisTurn) current = p;
          }
          return current?.name ?? null;
        }, { timeout: 15_000 })
        .not.toBeNull();
      const before = await getClientState(current!.page);

      await current!.page.reload();
      await expect(current!.page.getByTestId('end-turn-btn')).toBeEnabled({ timeout: 20_000 });
      await current!.page.getByTestId('end-turn-btn').click();

      await expect
        .poll(async () => (await getClientState(current!.page))?.currentPlayerId, { timeout: 10_000 })
        .not.toBe(before!.currentPlayerId);
    } finally {
      await closePlayers(players);
    }
  });
});
