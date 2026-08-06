import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { ClientGameState } from '@monopoly-deal/shared';

export interface NetPlayer {
  context: BrowserContext;
  page: Page;
  name: string;
}

export async function openPlayers(browser: Browser, n: number): Promise<NetPlayer[]> {
  const players: NetPlayer[] = [];
  for (let i = 0; i < n; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    players.push({ context, page, name: `P${i + 1}` });
  }
  return players;
}

export async function closePlayers(players: NetPlayer[]): Promise<void> {
  for (const p of players) {
    await p.context.close().catch(() => undefined);
  }
}

export async function hostCreateRoom(host: NetPlayer): Promise<string> {
  await host.page.goto('/');
  await host.page.getByTestId('display-name-input').fill(host.name);
  await host.page.getByTestId('create-room-btn').click();
  const codeEl = host.page.getByTestId('room-code');
  await expect(codeEl).toBeVisible({ timeout: 20_000 });
  return (await codeEl.innerText()).trim();
}

export async function joinRoom(player: NetPlayer, code: string): Promise<void> {
  await player.page.goto('/');
  await player.page.getByTestId('display-name-input').fill(player.name);
  await player.page.getByTestId('join-code-input').fill(code);
  await player.page.getByTestId('join-room-btn').click();
  await expect(player.page.getByTestId('room-code')).toHaveText(code, { timeout: 20_000 });
}

export async function startGame(host: NetPlayer): Promise<void> {
  await host.page.getByTestId('start-game-btn').click();
  await expect(host.page.getByTestId('draw-pile')).toBeVisible({ timeout: 20_000 });
}

export async function getClientState(page: Page): Promise<ClientGameState | null> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as {
        __MD_TEST__?: { getSnapshot: () => { clientState: ClientGameState | null } };
      }
    ).__MD_TEST__;
    return hook?.getSnapshot().clientState ?? null;
  });
}

export async function getSession(page: Page): Promise<{
  roomCode: string | null;
  playerToken: string | null;
  playerId: string | null;
}> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as {
        __MD_TEST__?: {
          getSnapshot: () => {
            roomCode: string | null;
            playerToken: string | null;
            playerId: string | null;
          };
        };
      }
    ).__MD_TEST__;
    const s = hook?.getSnapshot();
    return {
      roomCode: s?.roomCode ?? sessionStorage.getItem('md_roomCode'),
      playerToken: s?.playerToken ?? sessionStorage.getItem('md_playerToken'),
      playerId: s?.playerId ?? sessionStorage.getItem('md_playerId'),
    };
  });
}

export async function assertProjectionMatchesUi(page: Page): Promise<ClientGameState> {
  // The client auto-draws as soon as it's a seat's turn, which can race the SSE
  // projection landing vs. React re-rendering the hand — poll until both settle.
  await expect
    .poll(async () => {
      const s = await getClientState(page);
      const count = await page.locator('[data-testid^="hand-card-"]').count();
      return s ? count === s.you.hand.length : false;
    }, { timeout: 3000 })
    .toBe(true);

  const state = await getClientState(page);
  expect(state).toBeTruthy();
  const handCount = await page.locator('[data-testid^="hand-card-"]').count();
  expect(handCount).toBe(state!.you.hand.length);
  for (const p of state!.players) {
    if (p.id === state!.viewerId) continue;
    expect(p).not.toHaveProperty('hand');
  }
  return state!;
}

export async function postCommand(
  page: Page,
  type: string,
  payload: Record<string, unknown> = {},
  opts?: { token?: string; seq?: number },
): Promise<{ status: number; body: Record<string, unknown> }> {
  return page.evaluate(
    async ({ type, payload, opts }) => {
      const hook = (
        window as unknown as {
          __MD_TEST__?: {
            getSnapshot: () => { roomCode: string | null; playerToken: string | null };
          };
        }
      ).__MD_TEST__;
      const snap = hook?.getSnapshot();
      const roomCode = snap?.roomCode ?? sessionStorage.getItem('md_roomCode');
      const token = opts?.token ?? snap?.playerToken ?? sessionStorage.getItem('md_playerToken');
      const apiBase = (window as unknown as { __VITE_API_URL__?: string }).__VITE_API_URL__ ?? '';
      // Prefer same absolute API the app uses when set via env baked at build — fall back to proxy path.
      const base =
        apiBase ||
        (location.port === '5173' ? 'http://127.0.0.1:8787' : '');
      const seqKey = 'md_test_seq';
      const seq =
        opts?.seq ??
        (() => {
          const cur = Number(sessionStorage.getItem(seqKey) ?? '0');
          sessionStorage.setItem(seqKey, String(cur + 1));
          return cur;
        })();
      const res = await fetch(`${base}/rooms/${roomCode}/commands`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          v: 1,
          playerToken: token,
          seq,
          type,
          payload,
        }),
      });
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    },
    { type, payload, opts },
  );
}
