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

async function tryPromptActions(page: Page): Promise<boolean> {
  const decline = page.locator('[data-testid^="jsn-decline-btn"]');
  if (await decline.first().isVisible().catch(() => false)) {
    await decline.first().click({ timeout: 2000 }).catch(() => undefined);
    return true;
  }
  // Prefer API payment resolution over disabled Confirm buttons
  const rentColor = page.locator('[data-testid^="rent-color-"]');
  if (await rentColor.first().isVisible().catch(() => false)) {
    await rentColor.first().click({ timeout: 2000 }).catch(() => undefined);
    return true;
  }
  const rentPlayer = page.locator('[data-testid^="rent-player-"]');
  if (await rentPlayer.first().isVisible().catch(() => false)) {
    await rentPlayer.first().click({ timeout: 2000 }).catch(() => undefined);
    return true;
  }
  const debt = page.locator('[data-testid^="debt-collector-player-"]');
  if (await debt.first().isVisible().catch(() => false)) {
    await debt.first().click({ timeout: 2000 }).catch(() => undefined);
    return true;
  }
  const steal = page.locator('[data-testid^="steal-card-"]');
  if (await steal.first().isVisible().catch(() => false)) {
    await steal.first().click({ timeout: 2000 }).catch(() => undefined);
    return true;
  }
  const deal = page.locator('[data-testid^="deal-breaker-set-"]');
  if (await deal.first().isVisible().catch(() => false)) {
    await deal.first().click({ timeout: 2000 }).catch(() => undefined);
    return true;
  }
  const building = page.locator('[data-testid^="building-set-"]');
  if (await building.first().isVisible().catch(() => false)) {
    await building.first().click({ timeout: 2000 }).catch(() => undefined);
    return true;
  }
  return false;
}

/** Drive play via POST commands (faster/more reliable than DnD) until win. */
export async function botPlayUntilWin(
  players: NetPlayer[],
  maxMoves = 600,
): Promise<{ winner: boolean; moves: number }> {
  let moves = 0;
  while (moves < maxMoves) {
    for (const p of players) {
      if (await p.page.getByTestId('win-overlay').isVisible().catch(() => false)) {
        return { winner: true, moves };
      }
    }

    let acted = false;
    for (const p of players) {
      if (await tryPromptActions(p.page)) {
        acted = true;
        moves += 1;
        break;
      }
    }
    if (acted) continue;

    for (const p of players) {
      const st = await getClientState(p.page);
      if (!st || st.winnerId) {
        if (st?.winnerId) return { winner: true, moves };
        continue;
      }
      if (st.currentPlayerId !== st.viewerId) continue;

      const top = st.pendingStack[st.pendingStack.length - 1];
      if (top) {
        if (top.kind === 'just_say_no' && top.respondentId === st.viewerId) {
          const ack = await postCommand(p.page, 'DECLINE_JUST_SAY_NO');
          if (ack.body.ok) {
            acted = true;
            moves += 1;
            break;
          }
        }
        if (top.kind === 'payment' && top.payerId === st.viewerId) {
          const ids = st.you.board.bank.slice(0, 3).map((c) => c.id);
          const ack = await postCommand(p.page, 'SELECT_PAYMENT', { cardIds: ids });
          if (ack.body.ok) {
            acted = true;
            moves += 1;
            break;
          }
        }
        if (top.kind === 'rent_color_choice' && top.actorId === st.viewerId) {
          const ack = await postCommand(p.page, 'SELECT_RENT_COLOR', {
            color: top.eligibleColors[0],
          });
          if (ack.body.ok) {
            acted = true;
            moves += 1;
            break;
          }
        }
        if (top.kind === 'rent_player_choice' && top.actorId === st.viewerId) {
          const target = st.players.find((x) => x.id !== st.viewerId);
          if (target) {
            const ack = await postCommand(p.page, 'SELECT_RENT_PLAYER', {
              targetPlayerId: target.id,
            });
            if (ack.body.ok) {
              acted = true;
              moves += 1;
              break;
            }
          }
        }
        if (top.kind === 'debt_collector_target' && top.actorId === st.viewerId) {
          const target = st.players.find((x) => x.id !== st.viewerId);
          if (target) {
            const ack = await postCommand(p.page, 'SELECT_DEBT_COLLECTOR_PLAYER', {
              targetPlayerId: target.id,
            });
            if (ack.body.ok) {
              acted = true;
              moves += 1;
              break;
            }
          }
        }
        if (top.kind === 'hand_limit_discard' && top.playerId === st.viewerId) {
          const ids = st.you.hand.slice(0, top.excess).map((c) => c.id);
          const ack = await postCommand(p.page, 'DISCARD_EXCESS', { cardIds: ids });
          if (ack.body.ok) {
            acted = true;
            moves += 1;
            break;
          }
        }
        continue;
      }

      if (st.turnPhase === 'awaiting_draw') {
        const ack = await postCommand(p.page, 'DRAW_TURN_CARDS');
        if (ack.body.ok) {
          acted = true;
          moves += 1;
          break;
        }
      }

      if (st.turnPhase === 'playing') {
        if (st.playsRemaining > 0 && st.you.hand.length > 0) {
          const card = st.you.hand.find(
            (c) =>
              c.kind === 'money' ||
              c.kind === 'action' ||
              c.kind === 'rent' ||
              c.kind === 'property' ||
              c.kind === 'property_wild',
          );
          if (card) {
            let zone: 'bank' | 'property' | 'discard' = 'bank';
            const payload: Record<string, unknown> = { cardId: card.id, zone };
            if (card.kind === 'property') {
              zone = 'property';
              payload.zone = zone;
            } else if (card.kind === 'property_wild') {
              zone = 'property';
              payload.zone = zone;
              payload.target = {
                assignedColor: card.colors[0] ?? 'brown',
              };
            } else if (
              card.kind === 'action' &&
              (card.action === 'pass_go' ||
                card.action === 'its_my_birthday' ||
                card.action === 'double_the_rent')
            ) {
              zone = 'discard';
              payload.zone = zone;
            } else if (card.kind === 'action' && card.action === 'just_say_no') {
              // skip JSN as a play
              const other = st.you.hand.find((c) => c.id !== card.id);
              if (!other) {
                const end = await postCommand(p.page, 'END_TURN');
                if (end.body.ok) {
                  acted = true;
                  moves += 1;
                }
                break;
              }
              continue;
            } else if (card.kind === 'rent') {
              zone = 'discard';
              payload.zone = zone;
            }

            const ack = await postCommand(p.page, 'PLAY_CARD', payload);
            if (ack.body.ok) {
              acted = true;
              moves += 1;
              break;
            }
          }
        }
        const end = await postCommand(p.page, 'END_TURN');
        if (end.body.ok) {
          acted = true;
          moves += 1;
          break;
        }
      }
    }

    if (!acted) {
      moves += 1;
      await players[0]!.page.waitForTimeout(50);
    }
  }
  return { winner: false, moves };
}
