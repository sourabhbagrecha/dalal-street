/**
 * Leaving a game in progress: the sheet's "Leave" button asks first (Stay keeps the seat), and confirming takes the
 * seat out of the table for everyone else. Seeds real seats the way rematch.spec.ts does. Set LEAVE_SHOT_DIR to
 * also drop screenshots of the sheet and the confirm dialog there.
 */
import { expect, test } from '@playwright/test';
import { getClientState } from './helpers.js';

const API_BASE = process.env.MD_TEST_API_BASE ?? 'http://127.0.0.1:8787';
const SHOT_DIR = process.env.LEAVE_SHOT_DIR;

interface Seat {
  playerId: string;
  playerToken: string;
  isHost: boolean;
}

test('leave game: confirm dialog, Stay keeps the seat, Leave removes it for the others', async ({ browser, request }) => {
  const res = await request.post(`${API_BASE}/dev/rooms/fixture`, {
    data: { fixtureName: 'oneSetFromWinning', displayNames: ['Aarav', 'Priya', 'Vikram', 'Neha'] },
  });
  const body = (await res.json()) as { roomCode: string; seats: Seat[] };
  const code = body.roomCode.toUpperCase();
  const contexts = await Promise.all(body.seats.slice(0, 2).map(() => browser.newContext({ viewport: { width: 390, height: 780 } })));
  try {
    const pages = [];
    for (let i = 0; i < contexts.length; i++) {
      const seat = body.seats[i]!;
      await contexts[i]!.addInitScript(
        ({ code, session }) => {
          const raw = JSON.stringify(session);
          sessionStorage.setItem(`md_session:${code}`, raw);
          localStorage.setItem(`md_session:${code}`, raw);
        },
        { code, session: { playerToken: seat.playerToken, playerId: seat.playerId, isHost: seat.isHost } },
      );
      const page = await contexts[i]!.newPage();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`/rooms/${code}`);
      await expect(page.getByTestId('hand-fan')).toBeVisible({ timeout: 20_000 });
      pages.push(page);
    }
    const [stayer, leaver] = [pages[0]!, pages[1]!];

    await leaver.getByRole('button', { name: 'Open table feed' }).click();
    await expect(leaver.getByTestId('leave-game')).toBeVisible();
    if (SHOT_DIR) await leaver.screenshot({ path: `${SHOT_DIR}/sheet.png` });

    // Rules open as a popup over the table (same page, same seat); Escape and "Back to game" both close it.
    await leaver.getByTestId('rules-link').click();
    await expect(leaver.getByTestId('rules-modal')).toBeVisible();
    await expect(leaver.getByRole('heading', { level: 1, name: /Rules/ })).toBeVisible();
    if (SHOT_DIR) await leaver.screenshot({ path: `${SHOT_DIR}/rules.png` });
    expect(leaver.url()).toContain(`/rooms/${code}`);
    await leaver.keyboard.press('Escape');
    await expect(leaver.getByTestId('rules-modal')).toHaveCount(0);
    await expect(leaver.getByTestId('leave-game')).toBeVisible();
    await leaver.getByTestId('rules-link').click();
    await leaver.getByTestId('rules-close').click();
    await expect(leaver.getByTestId('rules-modal')).toHaveCount(0);

    await leaver.getByTestId('leave-game').click();
    await expect(leaver.getByTestId('leave-confirm')).toBeVisible();
    if (SHOT_DIR) await leaver.screenshot({ path: `${SHOT_DIR}/confirm.png` });

    await leaver.getByTestId('leave-stay').click();
    await expect(leaver.getByTestId('leave-confirm')).toHaveCount(0);
    expect((await getClientState(leaver))?.players).toHaveLength(4);

    await leaver.getByTestId('leave-game').click();
    await leaver.getByTestId('leave-confirm-btn').click();
    await expect(leaver).toHaveURL(/\/$/);
    await expect.poll(async () => (await getClientState(stayer))?.players.length, { timeout: 10_000 }).toBe(3);
  } finally {
    for (const c of contexts) await c.close().catch(() => undefined);
  }
});
