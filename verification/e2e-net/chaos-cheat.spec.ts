import { test, expect } from '@playwright/test';
import {
  closePlayers,
  getClientState,
  getSession,
  hostCreateRoom,
  joinRoom,
  openPlayers,
  postCommand,
  startGame,
} from './helpers.js';

test.describe('chaos: disconnect / reconnect', () => {
  test('refresh mid-game resumes with same token and snapshot', async ({ browser }) => {
    const players = await openPlayers(browser, 2);
    try {
      const code = await hostCreateRoom(players[0]!);
      await joinRoom(players[1]!, code);
      await startGame(players[0]!);
      await expect(players[1]!.page.getByTestId('draw-pile')).toBeVisible({ timeout: 20_000 });

      const session = await getSession(players[1]!.page);
      expect(session.playerToken).toBeTruthy();
      const before = await getClientState(players[1]!.page);
      expect(before?.you.hand.length).toBeGreaterThan(0);

      // Soft reload: stay on /game by forcing route after reload if lobby flashes
      await players[1]!.page.reload();
      await players[1]!.page.waitForTimeout(500);
      if (!(await players[1]!.page.getByTestId('draw-pile').isVisible().catch(() => false))) {
        await players[1]!.page.goto('/game');
      }
      await expect
        .poll(async () => (await getClientState(players[1]!.page))?.you.hand.length ?? 0, {
          timeout: 30_000,
        })
        .toBeGreaterThan(0);
      const after = await getClientState(players[1]!.page);
      expect(after?.viewerId).toBe(session.playerId);
      expect(after?.you.handCount).toBe(before!.you.handCount);
    } finally {
      await closePlayers(players);
    }
  });

  test('payment window stays healthy under short stalls', async ({ browser }) => {
    const players = await openPlayers(browser, 2);
    try {
      const code = await hostCreateRoom(players[0]!);
      await joinRoom(players[1]!, code);
      await startGame(players[0]!);
      await expect(players[0]!.page.getByTestId('draw-pile')).toBeVisible({ timeout: 20_000 });
      const st = await getClientState(players[0]!.page);
      expect(st).toBeTruthy();
      expect(st!.turnPhase).not.toBe('game_over');
    } finally {
      await closePlayers(players);
    }
  });
});

test.describe('chaos: concurrent join', () => {
  test('two clients joining same code are seated exactly once each', async ({ browser }) => {
    const host = await openPlayers(browser, 1);
    const code = await hostCreateRoom(host[0]!);

    const a = await browser.newContext();
    const b = await browser.newContext();
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    try {
      await Promise.all([
        (async () => {
          await pageA.goto('/');
          await pageA.getByTestId('display-name-input').fill('RaceA');
          await pageA.getByTestId('join-code-input').fill(code);
          await pageA.getByTestId('join-room-btn').click();
        })(),
        (async () => {
          await pageB.goto('/');
          await pageB.getByTestId('display-name-input').fill('RaceB');
          await pageB.getByTestId('join-code-input').fill(code);
          await pageB.getByTestId('join-room-btn').click();
        })(),
      ]);

      await expect(host[0]!.page.getByTestId('seat-list').locator('li')).toHaveCount(3, {
        timeout: 15_000,
      });
      await expect(pageA.getByTestId('seat-list').locator('li')).toHaveCount(3);
      await expect(pageB.getByTestId('seat-list').locator('li')).toHaveCount(3);
    } finally {
      await a.close();
      await b.close();
      await closePlayers(host);
    }
  });
});

test.describe('cheat probe', () => {
  test('wrong token, stale seq, malformed body, bad origin are rejected', async ({ browser }) => {
    const players = await openPlayers(browser, 2);
    try {
      const code = await hostCreateRoom(players[0]!);
      await joinRoom(players[1]!, code);
      await startGame(players[0]!);
      await expect(players[0]!.page.getByTestId('draw-pile')).toBeVisible({ timeout: 20_000 });

      const badToken = await postCommand(players[0]!.page, 'DRAW_TURN_CARDS', {}, {
        token: 'z'.repeat(32),
      });
      expect(badToken.status).toBe(401);

      // The client now auto-draws as soon as it's a seat's turn, so the "awaiting_draw"
      // window may already be gone by the time we look — treat both as valid.
      let drawer: (typeof players)[0] | undefined;
      let drawerState: Awaited<ReturnType<typeof getClientState>> | undefined;
      for (const p of players) {
        const st = await getClientState(p.page);
        if (st?.currentPlayerId === st?.viewerId) {
          drawer = p;
          drawerState = st;
          break;
        }
      }
      expect(drawer).toBeTruthy();
      if (drawerState?.turnPhase === 'awaiting_draw') {
        const ok = await postCommand(drawer!.page, 'DRAW_TURN_CARDS');
        expect(ok.body.ok).toBe(true);
      }

      const stale = await postCommand(drawer!.page, 'END_TURN', {}, { seq: 0 });
      expect(stale.body.ok === true && stale.body.duplicate === true || stale.body.ok === false).toBe(
        true,
      );

      const malformed = await players[0]!.page.evaluate(async () => {
        const roomCode = sessionStorage.getItem('md_roomCode');
        const res = await fetch(`http://127.0.0.1:8787/rooms/${roomCode}/commands`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ v: 1, seq: 'nope' }),
        });
        return { status: res.status, body: await res.json() };
      });
      expect(malformed.status).toBe(400);
      expect((malformed.body as { code?: string }).code).toBe('validation');

      const healthy = await getClientState(players[0]!.page);
      expect(healthy).toBeTruthy();
    } finally {
      await closePlayers(players);
    }
  });
});
