import { expect, test } from '@playwright/test';
import { closePlayers } from './helpers.js';
import { dragCardToZone, seedAndJoinFixture } from './momentsHelpers.js';

/**
 * Table Moments over the real server + SSE. Fixtures are seeded directly via
 * the dev `/dev/rooms/fixture` route (skips the lobby), with
 * displayNames mapping onto the fixture's own player order: seat 1 = p1 =
 * Aarav, seat 2 = p2 = Priya, seat 3 = p3 = Marcus, seat 4 = p4 = Yuki.
 */
test.describe('table moments over the network', () => {
  test('sly deal reaches actor, victim and spectator with the right perspective', async ({ browser }) => {
    test.slow();
    const { players } = await seedAndJoinFixture(browser, 'responsiveMidGame', [
      'Aarav',
      'Priya',
      'Marcus',
      'Yuki',
    ]);
    const [p1, p2, p3] = players;
    try {
      await dragCardToZone(p1!.page, 'hand-card-sd1', 'discard-drop');
      await p1!.page.getByTestId('steal-card-u1').click();

      const actorCallout = p1!.page.getByTestId('moment-callout');
      await expect(actorCallout).toBeVisible({ timeout: 8000 });
      await expect(actorCallout).toHaveAttribute('data-perspective', 'actor');

      const victimCallout = p3!.page.getByTestId('moment-callout');
      await expect(victimCallout).toBeVisible({ timeout: 8000 });
      await expect(victimCallout).toHaveAttribute('data-perspective', 'victim');
      await expect(victimCallout).toContainText(/Aarav took your/i);
      await expect(p3!.page.getByTestId('notice-stack')).toBeVisible({ timeout: 8000 });
      await expect(p3!.page.getByTestId('notice').first()).toHaveAttribute('data-tone', 'danger');
      await expect(p3!.page.getByTestId('notice').first()).toContainText(/Aarav took your/i);

      const spectatorCallout = p2!.page.getByTestId('moment-callout');
      await expect(spectatorCallout).toBeVisible({ timeout: 8000 });
      await expect(spectatorCallout).toHaveAttribute('data-perspective', 'spectator');
      await expect(spectatorCallout).toContainText(/Aarav took .* from Marcus/i);
      await expect(p2!.page.getByTestId('notice-stack')).toHaveCount(0);

      await expect(p3!.page.getByTestId('opponent-spotlight')).toBeVisible({ timeout: 8000 });

      await expect(
        p1!.page.locator('[data-testid="properties-drop"] [data-card-id="u1"]'),
      ).toBeVisible({ timeout: 8000 });
      await expect(
        p3!.page.locator('[data-testid="properties-drop"] [data-card-id="u1"]'),
      ).toHaveCount(0);
    } finally {
      await closePlayers(players);
    }
  });

  test('debt collector callout and payment window both land on the target', async ({ browser }) => {
    test.slow();
    const { players } = await seedAndJoinFixture(browser, 'debtCollectorChoice', [
      'Aarav',
      'Priya',
      'Marcus',
      'Yuki',
    ]);
    const [p1, , p3] = players;
    try {
      await dragCardToZone(p1!.page, 'hand-card-dc1', 'discard-drop');
      await p1!.page.getByTestId('debt-collector-player-p3').click();

      const callout = p3!.page.getByTestId('moment-callout');
      await expect(callout).toBeVisible({ timeout: 8000 });
      await expect(callout).toHaveAttribute('data-kind', 'debt_collector');
      await expect(callout).toContainText(/demands .* from you/i);

      const paymentPrompt = p3!.page.getByTestId('payment-prompt');
      await expect(paymentPrompt).toBeVisible({ timeout: 8000 });

      const cardButtons = p3!.page.locator('[data-testid^="payment-card-"]');
      const cardCount = await cardButtons.count();
      for (let i = 0; i < cardCount; i++) {
        await cardButtons.nth(i).click();
      }
      await p3!.page.getByTestId('confirm-payment-btn').click();
      await expect(paymentPrompt).toBeHidden({ timeout: 8000 });

      await expect(p1!.page.getByTestId('notice').first()).toContainText(/Marcus paid you/i, {
        timeout: 8000,
      });

      // The payer gets their own confirmation notice too (actor perspective —
      // see apps/web/src/moments/copy.ts's 'payment' case and
      // components/NoticeStack.tsx's ingest comment), appended after the
      // earlier "demands" notice — NoticeStack sorts oldest-first, so the
      // newest (this receipt) is last, not first.
      await expect(p3!.page.getByTestId('notice').last()).toContainText(/You paid .* to Aarav/i, {
        timeout: 8000,
      });
    } finally {
      await closePlayers(players);
    }
  });

  test('just say no reaches the initiator and a spectator with distinct wording', async ({ browser }) => {
    test.slow();
    const { players } = await seedAndJoinFixture(browser, 'doubleJustSayNoChain', [
      'Aarav',
      'Priya',
      'Marcus',
      'Yuki',
    ]);
    const [p1, p2, p3] = players;
    try {
      await expect(p2!.page.getByTestId('jsn-prompt')).toBeVisible({ timeout: 8000 });
      await p2!.page.getByTestId('jsn-play-jsn_b').click();

      const initiatorCallout = p1!.page.getByTestId('moment-callout');
      await expect(initiatorCallout).toBeVisible({ timeout: 8000 });
      await expect(initiatorCallout).toHaveAttribute('data-tone', 'danger');
      // Priya (p2) is this fixture's respondent (pendingStack.respondentId
      // === 'p2') and holds/plays jsn_b — not Marcus.
      await expect(initiatorCallout).toContainText(/Priya says NO to your/i);

      const spectatorCallout = p3!.page.getByTestId('moment-callout');
      await expect(spectatorCallout).toBeVisible({ timeout: 8000 });
      await expect(spectatorCallout).toContainText(/Priya says NO to Aarav's/i);
    } finally {
      await closePlayers(players);
    }
  });
});
