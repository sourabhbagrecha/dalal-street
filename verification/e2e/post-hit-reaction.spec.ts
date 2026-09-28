import { expect, test } from '@playwright/test';

/**
 * Right after a beat lands that hit the viewer, the reaction picker pops open on its own (table/reactions/
 * Reactions.tsx, table/reactions/hit.ts) — a reaction is one tap away instead of something to dig for.
 *
 * debtCollectorSoleRival: Aarav (p1) holds Debt Collector, Priya (p2) is the only rival and has exactly one
 * ₹5 bank note. Priya's tab holds a real seat in a real room (the same production networkAdapter e2e-net uses,
 * seeded from a dev fixture instead of a random deal) and stays open and live the whole time; Aarav's play is
 * sent straight to the server as a plain HTTP command, never through a browser tab of his own. /demo's single-tab
 * seat switcher is deliberately not used here: swapping its rendered seat remounts the table and takes a fresh
 * silent baseline (see table/liveEvents.ts), which would rebaseline away the very beat this test watches for.
 */
test.describe('post-hit reaction nudge', () => {
  test('paying a demand pops the reaction picker open, unasked', async ({ page, request }) => {
    const created = await request.post('/dev/rooms/fixture', {
      data: { fixtureName: 'debtCollectorSoleRival', displayNames: ['Aarav', 'Priya'] },
    });
    expect(created.ok()).toBe(true);
    const room = (await created.json()) as { roomCode: string; seats: { playerId: string; playerToken: string; isHost: boolean }[] };
    const p1 = room.seats[0]!;
    const p2 = room.seats[1]!;

    // Priya's tab: a real seat in a real room, the ordinary reconnect path (RoomPage / networkAdapter) — seeded
    // directly with her session instead of going through the join form.
    await page.addInitScript(
      ({ code, session }) => sessionStorage.setItem(`md_session:${code}`, JSON.stringify(session)),
      { code: room.roomCode, session: { playerToken: p2.playerToken, playerId: p2.playerId, isHost: p2.isHost } },
    );
    await page.goto(`/rooms/${room.roomCode}`);
    await expect(page.getByTestId('hand-fan')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('reaction-menu')).toBeHidden();

    // Aarav plays Debt Collector and names Priya (the only rival) — a plain command, no browser tab of his own.
    const played = await request.post(`/rooms/${room.roomCode}/commands`, {
      data: { v: 1, playerToken: p1.playerToken, seq: 0, type: 'PLAY_CARD', payload: { cardId: 'dc1', zone: 'discard' } },
    });
    expect((await played.json()).ok).toBe(true);
    const targeted = await request.post(`/rooms/${room.roomCode}/commands`, {
      data: { v: 1, playerToken: p1.playerToken, seq: 1, type: 'SELECT_DEBT_COLLECTOR_PLAYER', payload: { targetPlayerId: p2.playerId } },
    });
    expect((await targeted.json()).ok).toBe(true);

    // Priya pays it off, through her own real UI — the moment the ₹5 actually leaves her board is the hit.
    await expect(page.getByTestId('payment-prompt')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('payment-card-p2b').click();
    await page.getByTestId('confirm-payment-btn').click({ force: true });
    await expect(page.getByTestId('payment-prompt')).toBeHidden({ timeout: 10_000 });

    // The picker is open without a tap on the reaction button, and it says why.
    await expect(page.getByTestId('reaction-menu')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.rx-dock')).toHaveAttribute('data-nudge', 'true');
    await expect(page.getByRole('status').filter({ hasText: /react to what just happened/i })).toBeAttached();

    // Tapping a face throws it and clears the nudge, same as any other reaction.
    await page.getByTestId('reaction-sad').click();
    await expect(page.getByTestId('reaction-menu')).toBeHidden();
    await expect(page.locator('.rx-dock')).not.toHaveAttribute('data-nudge', 'true');
  });
});
