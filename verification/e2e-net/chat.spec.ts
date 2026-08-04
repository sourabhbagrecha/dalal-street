import { test, expect } from '@playwright/test';
import { closePlayers, hostCreateRoom, joinRoom, openPlayers, startGame } from './helpers.js';

test.describe('table chat', () => {
  test('lobby chat is delivered to all seats, including history on late join', async ({
    browser,
  }) => {
    const players = await openPlayers(browser, 2);
    try {
      const code = await hostCreateRoom(players[0]!);

      await players[0]!.page.getByTestId('chat-input').fill('hello from host');
      await players[0]!.page.getByTestId('chat-send-btn').click();
      await expect(players[0]!.page.getByText('hello from host')).toBeVisible({
        timeout: 10_000,
      });

      // Second player joins after the message was sent — must still see history.
      await joinRoom(players[1]!, code);
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

      for (const p of players) {
        await expect(p.page.getByTestId('draw-pile')).toBeVisible({ timeout: 20_000 });
      }

      await players[1]!.page.getByTestId('chat-input').fill('good luck!');
      await players[1]!.page.getByTestId('chat-send-btn').click();
      await expect(players[0]!.page.getByText('good luck!')).toBeVisible({ timeout: 10_000 });
    } finally {
      await closePlayers(players);
    }
  });
});
