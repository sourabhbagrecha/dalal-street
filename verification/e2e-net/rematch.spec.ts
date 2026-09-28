/**
 * Same-room rematch: every seated player taps Rematch, then the room deals a fresh game to the same
 * seats (apps/server/src/room.ts's `requestRematch`/`beginGame`).
 *
 * Reaching an actual win through the real join-room flow would mean playing a whole (randomly dealt)
 * game to completion over the network — `full-game.spec.ts` explicitly leaves that to `netSim.ts`
 * instead. This spec gets a deterministic near-win table the same way `/demo` does — the dev-only
 * `/dev/rooms/fixture` route (apps/server/src/routes.ts, gated to non-production, the same server this
 * config already boots) — but then seeds each seat's own real browser page with its real
 * `playerToken`/`playerId` (the exact shape `store/session.ts` reads) and lets it load `/rooms/:code`
 * through the production `RoomPage` → `GameView` → `networkAdapter` path, unlike `/demo`'s single-page
 * seat-switcher (whose adapter deliberately has no `requestRematch` — see `kit.tsx`'s `Victory`).
 */
import { expect, test, type Page } from '@playwright/test';
import { dragCardToZone } from '../e2e/helpers/dnd.js';
import { getClientState } from './helpers.js';

// Overridable for a one-off run against an isolated port pair (see the sandbox note in the PR/report) —
// the default matches this config's own webServer and every other e2e-net spec.
const API_BASE = process.env.MD_TEST_API_BASE ?? 'http://127.0.0.1:8787';

interface Seat {
  seatIndex: number;
  playerId: string;
  playerToken: string;
  displayName: string;
  isHost: boolean;
}

test.describe('rematch', () => {
  test('every seat taps Rematch, then a fresh game deals to the same seats', async ({ browser, request }) => {
    const res = await request.post(`${API_BASE}/dev/rooms/fixture`, {
      data: {
        fixtureName: 'oneSetFromWinning',
        displayNames: ['Aarav', 'Priya', 'Vikram', 'Neha'],
      },
    });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { ok: boolean; roomCode: string; seats: Seat[] };
    expect(body.ok).toBe(true);
    const code = body.roomCode.toUpperCase();
    const seats = body.seats;
    expect(seats).toHaveLength(4);

    const contexts = await Promise.all(seats.map(() => browser.newContext()));
    const pages: Page[] = [];
    try {
      for (let i = 0; i < seats.length; i++) {
        const seat = seats[i]!;
        const context = contexts[i]!;
        // Runs before any page script on every navigation to this origin — the same shape
        // `saveRoomSession` writes, so `RoomPage`'s mount-time `reconnect(code)` finds a real seat.
        await context.addInitScript(
          ({ code, session }) => {
            const key = `md_session:${code}`;
            const raw = JSON.stringify(session);
            sessionStorage.setItem(key, raw);
            localStorage.setItem(key, raw);
          },
          { code, session: { playerToken: seat.playerToken, playerId: seat.playerId, isHost: seat.isHost } },
        );
        const page = await context.newPage();
        await page.emulateMedia({ reducedMotion: 'reduce' });
        pages.push(page);
      }

      await Promise.all(
        pages.map(async (page, i) => {
          await page.goto(`/rooms/${code}`);
          await expect(page.getByTestId('hand-fan')).toBeVisible({ timeout: 20_000 });
          const state = await getClientState(page);
          expect(state?.viewerId).toBe(seats[i]!.playerId);
        }),
      );

      // p1 (seat 0) plays db2 onto its own incomplete dark_blue set — the fixture's brown and utility
      // sets are already complete, so this is the third and wins.
      await dragCardToZone(pages[0]!, 'hand-card-db2', 'properties-drop');

      await expect(pages[0]!.getByTestId('win-overlay')).toBeVisible({ timeout: 15_000 });
      expect(await pages[0]!.getByTestId('win-overlay').getAttribute('data-winner')).toBe('you');
      for (const page of pages.slice(1)) {
        await expect(page.getByTestId('win-overlay')).toBeVisible({ timeout: 15_000 });
        expect(await page.getByTestId('win-overlay').getAttribute('data-winner')).toBe('rival');
      }

      for (const page of pages) {
        await expect(page.getByTestId('rematch-btn')).toBeVisible({ timeout: 5_000 });
      }

      // Three of four tap: not enough on its own, and the game is untouched.
      for (const page of pages.slice(0, 3)) {
        await page.getByTestId('rematch-btn').click();
        await expect(page.getByTestId('rematch-btn')).toBeDisabled({ timeout: 5_000 });
      }
      await expect(pages[3]!.getByTestId('win-overlay')).toBeVisible();
      await expect(pages[3]!.getByTestId('rematch-btn')).toContainText(/3\s*\/\s*4/, { timeout: 10_000 });

      // The last seat taps: the room deals a fresh game to every seat.
      await pages[3]!.getByTestId('rematch-btn').click();

      for (const page of pages) {
        await expect(page.getByTestId('win-overlay')).not.toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId('hand-fan')).toBeVisible({ timeout: 15_000 });
      }
      await expect
        .poll(async () => (await getClientState(pages[0]!))?.winnerId, { timeout: 10_000 })
        .toBeNull();
      const fresh = await getClientState(pages[0]!);
      expect(fresh).toBeTruthy();
      expect(fresh!.turnNumber).toBe(1);
    } finally {
      for (const context of contexts) await context.close().catch(() => undefined);
    }
  });
});
