import { test, expect, type Page } from '@playwright/test';
import { closePlayers, hostCreateRoom, joinRoom, openPlayers, startGame } from './helpers.js';

/**
 * Chat sits behind a sheet on both screens, and a closed sheet is `inert`:
 * the waiting room's "Open chat" button (its label grows an unread count), and
 * the table's feed sheet (HUD "Open chat and game log" button, then its Chat tab).
 */
async function openLobbyChat(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Open chat/ }).click();
  await expect(page.getByTestId('chat-input')).toBeVisible();
}

async function openTableChat(page: Page): Promise<void> {
  const opener = page.getByRole('button', { name: 'Open chat and game log' });
  if ((await opener.getAttribute('aria-expanded')) !== 'true') await opener.click();
  await page.getByTestId('feed-tab-chat').click();
  await expect(page.getByTestId('chat-input')).toBeVisible();
}

test.describe('table chat', () => {
  test('lobby chat is delivered to all seats, including history on late join', async ({
    browser,
  }) => {
    const players = await openPlayers(browser, 2);
    try {
      const code = await hostCreateRoom(players[0]!);

      await openLobbyChat(players[0]!.page);
      await players[0]!.page.getByTestId('chat-input').fill('hello from host');
      await players[0]!.page.getByTestId('chat-send-btn').click();
      await expect(players[0]!.page.getByText('hello from host')).toBeVisible({
        timeout: 10_000,
      });

      // Second player joins after the message was sent — must still see history.
      await joinRoom(players[1]!, code);
      await openLobbyChat(players[1]!.page);
      await expect(players[1]!.page.getByText('hello from host')).toBeVisible({
        timeout: 10_000,
      });

      await players[1]!.page.getByTestId('chat-input').fill('hi back');
      await players[1]!.page.getByTestId('chat-send-btn').click();
      await expect(players[0]!.page.getByText('hi back')).toBeVisible({ timeout: 10_000 });
    } finally {
      await closePlayers(players);
    }
  });

  test('chat keeps working after the game starts', async ({ browser }) => {
    const players = await openPlayers(browser, 2);
    try {
      const code = await hostCreateRoom(players[0]!);
      await joinRoom(players[1]!, code);
      await startGame(players[0]!);

      // `hand-fan`, not `draw-pile` — always on screen for every seat, unlike
      // draw-pile which only renders for whoever's currently acting.
      for (const p of players) {
        await expect(p.page.getByTestId('hand-fan')).toBeVisible({ timeout: 20_000 });
      }

      await openTableChat(players[0]!.page);
      await openTableChat(players[1]!.page);
      await players[1]!.page.getByTestId('chat-input').fill('good luck!');
      await players[1]!.page.getByTestId('chat-send-btn').click();
      await expect(players[0]!.page.getByLabel('Table chat').getByText('good luck!')).toBeVisible({ timeout: 10_000 });
    } finally {
      await closePlayers(players);
    }
  });
});
