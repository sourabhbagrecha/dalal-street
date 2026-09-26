import { test, expect, type Page, type Route } from '@playwright/test';
import type { Card, ClientGameState } from '@monopoly-deal/shared';
import { closePlayers, getClientState, hostCreateRoom, joinRoom, openPlayers, startGame, type NetPlayer } from './helpers.js';

/**
 * A slow or unreliable line must not show in the hand. A card the player drops leaves the hand and lands where it was
 * dropped at once, whatever the server is doing; if the server refuses (or never hears), it goes back. None of it may
 * touch the projection: `clientState` only ever changes when the server says so.
 */

/** "At once", with room for a busy machine: every server answer in these tests is held back well past it. */
const GONE = 1000;

const isDroppable = (c: Card) => c.kind === 'money' || c.kind === 'property';

async function startTable(browser: Parameters<typeof openPlayers>[0]): Promise<{ players: NetPlayer[]; me: NetPlayer }> {
  const players = await openPlayers(browser, 2);
  const code = await hostCreateRoom(players[0]!);
  await joinRoom(players[1]!, code);
  await startGame(players[0]!);
  for (const p of players) await expect(p.page.getByTestId('hand-fan')).toBeVisible({ timeout: 20_000 });
  // Whoever is on turn draws by themselves; wait for it to be theirs to play.
  let me: NetPlayer | undefined;
  await expect
    .poll(
      async () => {
        for (const p of players) {
          const s = await getClientState(p.page);
          if (s && s.currentPlayerId === s.viewerId && s.turnPhase === 'playing') {
            me = p;
            return true;
          }
        }
        return false;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return { players, me: me! };
}

/** Cards that land wherever they are dropped on your own table: cash banks, a plain property builds its colour. */
function droppable(state: ClientGameState | null): Card[] {
  return state?.you.hand.filter(isDroppable) ?? [];
}

/** A point on the card that is really the card's: hand cards overlap in the fan, so the middle of one is often another's. */
async function grabPoint(page: Page, cardId: string): Promise<{ x: number; y: number }> {
  const pt = await page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="hand-card-${id}"]`)!;
    const r = el.getBoundingClientRect();
    for (let fy = 0.3; fy <= 0.9; fy += 0.1) {
      for (let fx = 0.1; fx <= 0.9; fx += 0.1) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        if (document.elementFromPoint(x, y)?.closest('[data-testid^="hand-card-"]') === el) return { x, y };
      }
    }
    return null;
  }, cardId);
  expect(pt, `a visible part of ${cardId}`).not.toBeNull();
  return pt!;
}

async function dragOntoMyTable(page: Page, cardId: string): Promise<void> {
  const { x, y } = await grabPoint(page, cardId);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 40, { steps: 4 });
  // The camera swings onto your own table as the card lifts.
  await page.waitForTimeout(700);
  const to = (await page.getByTestId('table-seat-self').boundingBox())!;
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
}

const isPlay = (route: Route) => (route.request().postDataJSON() as { type?: string }).type === 'PLAY_CARD';

test.describe('a slow or broken line', () => {
  test('a dropped card leaves the hand at once and waits for the server where it was put', async ({ browser }) => {
    test.slow();
    const { players, me } = await startTable(browser);
    try {
      const page = me.page;
      const card = droppable(await getClientState(page))[0];
      test.skip(!card, 'no cash or property dealt to this hand');

      await page.route('**/commands', async (route) => {
        if (!isPlay(route)) return route.continue();
        await new Promise((r) => setTimeout(r, 2500));
        await route.continue();
      });

      await dragOntoMyTable(page, card!.id);

      // Gone from the hand within a moment, while the server has not answered…
      await expect(page.getByTestId(`hand-card-${card!.id}`)).toHaveCount(0, { timeout: GONE });
      // …and standing on the table (the parked copy on the stage), not vanished.
      await expect(page.locator('.st-actor')).toHaveCount(1);
      // The projection is the server's word alone: it still holds the card.
      expect((await getClientState(page))!.you.hand.some((c) => c.id === card!.id)).toBe(true);

      // Then the server catches up and agrees.
      await expect.poll(async () => (await getClientState(page))!.you.hand.some((c) => c.id === card!.id), { timeout: 10_000 }).toBe(false);
      await expect(page.getByTestId(`hand-card-${card!.id}`)).toHaveCount(0);
      await expect(page.locator('.st-actor')).toHaveCount(0, { timeout: 5000 });
    } finally {
      await closePlayers(players);
    }
  });

  test('a refused play sends the card back to the hand', async ({ browser }) => {
    test.slow();
    const { players, me } = await startTable(browser);
    try {
      const page = me.page;
      const card = droppable(await getClientState(page))[0];
      test.skip(!card, 'no cash or property dealt to this hand');

      // A card the server does not know: it says no for real.
      await page.route('**/commands', async (route) => {
        if (!isPlay(route)) return route.continue();
        const body = route.request().postDataJSON() as { payload: Record<string, unknown> };
        await new Promise((r) => setTimeout(r, 1800));
        await route.continue({ postData: JSON.stringify({ ...body, payload: { ...body.payload, cardId: 'no-such-card' } }) });
      });

      await dragOntoMyTable(page, card!.id);
      await expect(page.getByTestId(`hand-card-${card!.id}`)).toHaveCount(0, { timeout: GONE });

      await expect(page.getByTestId(`hand-card-${card!.id}`)).toHaveCount(1, { timeout: 5000 });
      await expect(page.locator('.st-actor')).toHaveCount(0, { timeout: 5000 });
      const state = (await getClientState(page))!;
      expect(state.you.hand.some((c) => c.id === card!.id)).toBe(true);
    } finally {
      await closePlayers(players);
    }
  });

  test('a request that gets no answer is sent again and lands exactly once', async ({ browser }) => {
    test.slow();
    const { players, me } = await startTable(browser);
    try {
      const page = me.page;
      const before = await getClientState(page);
      const card = droppable(before)[0];
      test.skip(!card, 'no cash or property dealt to this hand');

      let seen = 0;
      const seqs: number[] = [];
      await page.route('**/commands', async (route) => {
        if (!isPlay(route)) return route.continue();
        seqs.push((route.request().postDataJSON() as { seq: number }).seq);
        // The first two tries die on the wire; the third gets through.
        if (++seen <= 2) return route.abort('connectionfailed');
        return route.continue();
      });

      await dragOntoMyTable(page, card!.id);
      await expect(page.getByTestId(`hand-card-${card!.id}`)).toHaveCount(0, { timeout: GONE });

      await expect.poll(async () => (await getClientState(page))!.you.hand.some((c) => c.id === card!.id), { timeout: 15_000 }).toBe(false);
      expect(seqs).toHaveLength(3);
      expect(new Set(seqs).size).toBe(1); // one command, retried under the same sequence number
      await expect(page.getByTestId(`hand-card-${card!.id}`)).toHaveCount(0);
      const after = (await getClientState(page))!;
      const onTable = [...after.you.board.bank, ...after.you.board.sets.flatMap((s) => s.cards)].filter((c) => c.id === card!.id);
      expect(onTable).toHaveLength(1);
    } finally {
      await closePlayers(players);
    }
  });

  test('a line that never answers gives the card back', async ({ browser }) => {
    test.slow();
    const { players, me } = await startTable(browser);
    try {
      const page = me.page;
      const card = droppable(await getClientState(page))[0];
      test.skip(!card, 'no cash or property dealt to this hand');

      await page.route('**/commands', (route) => (isPlay(route) ? route.abort('connectionfailed') : route.continue()));

      await dragOntoMyTable(page, card!.id);
      await expect(page.getByTestId(`hand-card-${card!.id}`)).toHaveCount(0, { timeout: GONE });
      // Three tries, a moment apart, then it is plainly not going to happen.
      await expect(page.getByTestId(`hand-card-${card!.id}`)).toHaveCount(1, { timeout: 8000 });
      expect((await getClientState(page))!.you.hand.some((c) => c.id === card!.id)).toBe(true);
    } finally {
      await closePlayers(players);
    }
  });

  test('ending the turn reads as sent, and pressing it again sends nothing', async ({ browser }) => {
    test.slow();
    const { players, me } = await startTable(browser);
    try {
      const page = me.page;
      let ends = 0;
      await page.route('**/commands', async (route) => {
        if ((route.request().postDataJSON() as { type?: string }).type !== 'END_TURN') return route.continue();
        ends++;
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });

      const end = page.getByTestId('end-turn-btn');
      await end.click();
      await expect(end).toBeDisabled({ timeout: GONE });
      await expect(end).toContainText('SENDING');
      await end.click({ force: true }).catch(() => undefined);

      await expect.poll(async () => (await getClientState(page))!.currentPlayerId !== (await getClientState(page))!.viewerId, { timeout: 10_000 }).toBe(true);
      expect(ends).toBe(1);
    } finally {
      await closePlayers(players);
    }
  });

  test('two cards dropped in a row arrive in order even when the line reorders requests', async ({ browser }) => {
    test.slow();
    const { players, me } = await startTable(browser);
    try {
      const page = me.page;
      const cards = droppable(await getClientState(page));
      test.skip(cards.length < 2, 'fewer than two cash or property cards dealt');
      const [a, b] = cards as [Card, Card];

      // The first request is the slow one: sent in parallel, the second would land first and the first be thrown out as stale.
      let n = 0;
      await page.route('**/commands', async (route) => {
        if (!isPlay(route)) return route.continue();
        const mine = n++;
        await new Promise((r) => setTimeout(r, mine === 0 ? 1200 : 50));
        await route.continue();
      });

      await dragOntoMyTable(page, a.id);
      await expect(page.getByTestId(`hand-card-${a.id}`)).toHaveCount(0, { timeout: GONE });
      // The fan closes the gap with a short slide: let it settle so the next press lands on the card it means to.
      await page.waitForTimeout(500);
      await dragOntoMyTable(page, b.id);
      await expect(page.getByTestId(`hand-card-${b.id}`)).toHaveCount(0, { timeout: GONE });

      await expect
        .poll(async () => {
          const s = (await getClientState(page))!;
          return !s.you.hand.some((c) => c.id === a.id) && !s.you.hand.some((c) => c.id === b.id);
        }, { timeout: 15_000 })
        .toBe(true);
      await expect(page.getByTestId(`hand-card-${a.id}`)).toHaveCount(0);
      await expect(page.getByTestId(`hand-card-${b.id}`)).toHaveCount(0);
    } finally {
      await closePlayers(players);
    }
  });
});
