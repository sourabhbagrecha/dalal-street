import { expect, test } from '@playwright/test';
import { loadFixture } from './helpers/demo';
import { dragCardToZone } from './helpers/dnd';

/**
 * /demo coverage for Table Moments (callouts + notices). Seat switching goes
 * through the keyboard shortcut DemoGameApp wires up (keys 1..N ->
 * adapter.setSeat(index-1)); seat index directly indexes the fixture's own
 * `players` array order, so for every fixture here seat 1 = p1 = Aarav, seat
 * 2 = p2 = Priya, seat 3 = p3 = Marcus, seat 4 = p4 = Yuki.
 */
test.describe('table moments', () => {
  test('sly deal — actor callout, victim callout + notice, board updates', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'responsiveMidGame');

    await dragCardToZone(page, 'hand-card-sd1', 'discard-drop');
    await page.getByTestId('steal-card-u1').click();

    const callout = page.getByTestId('moment-callout');
    await expect(callout).toBeVisible();
    await expect(callout).toHaveAttribute('data-kind', 'sly_deal');
    await expect(callout).toHaveAttribute('data-perspective', 'actor');
    await expect(callout).toContainText(/SLY DEAL/i);
    await expect(callout).toContainText(/You took Marcus's/i);

    // Deliberately not asserting board `data-attention` timing here — flaky.
    await expect(callout).toBeHidden({ timeout: 5000 });

    await page.keyboard.press('3');

    const victimCallout = page.getByTestId('moment-callout');
    await expect(victimCallout).toBeVisible();
    await expect(victimCallout).toHaveAttribute('data-perspective', 'victim');
    await expect(victimCallout).toHaveAttribute('data-tone', 'danger');
    await expect(victimCallout).toContainText(/Aarav took your/i);

    await expect(page.getByTestId('notice-stack')).toBeVisible();
    const notice = page.getByTestId('notice').first();
    await expect(notice).toHaveAttribute('data-tone', 'danger');
    await expect(notice).toContainText(/Aarav took your/i);

    await page.getByTestId('notice-dismiss').first().click();
    await expect(page.getByTestId('notice')).toHaveCount(0);

    await page.keyboard.press('1');
    await expect(
      page.locator('[data-testid="properties-drop"] [data-card-id="u1"]'),
    ).toBeVisible();
  });

  test('deal breaker — spectator gets no victim notice', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'dealBreakerOnSetWithHotel');

    await dragCardToZone(page, 'hand-card-dbk1', 'discard-drop');
    await page.getByTestId('deal-breaker-set-set_yellow_full').click();

    const callout = page.getByTestId('moment-callout');
    await expect(callout).toBeVisible();
    await expect(callout).toHaveAttribute('data-kind', 'deal_breaker');
    await expect(callout).toContainText(/whole/i);

    await page.keyboard.press('2');
    await expect(page.getByTestId('moment-callout')).toContainText(/took your whole/i);
    await expect(page.getByTestId('notice-stack')).toBeVisible();
    await expect(page.getByTestId('notice').first()).toContainText(/took your whole/i);

    await page.keyboard.press('3');
    await expect(page.getByTestId('notice-stack')).toHaveCount(0);
  });

  test('debt collector — actor callout, payer gets the prompt alone, clicks land', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'debtCollectorChoice');

    await dragCardToZone(page, 'hand-card-dc1', 'discard-drop');
    await page.getByTestId('debt-collector-player-p3').click();

    // Aarav (the actor) gets the callout.
    const callout = page.getByTestId('moment-callout');
    await expect(callout).toBeVisible();
    await expect(callout).toHaveAttribute('data-kind', 'debt_collector');
    await expect(callout).toContainText(/You demand .* from Marcus/i);

    await page.keyboard.press('3');

    const paymentPrompt = page.getByTestId('payment-prompt');
    await expect(paymentPrompt).toBeVisible();
    await expect(paymentPrompt).toContainText(/Pay .*to Aarav/);
    await expect(paymentPrompt).toContainText(/Debt Collector/);
    await expect(paymentPrompt).not.toContainText(/debt_collector/);

    // Since a203979 the payer's demand callout steps aside for the prompt
    // (moments/paymentFocus.ts) — the prompt already says who wants what.
    await expect(page.getByTestId('moment-callout')).toHaveCount(0);

    const cardButtons = page.locator('[data-testid^="payment-card-"]');
    const cardCount = await cardButtons.count();
    for (let i = 0; i < cardCount; i++) {
      await cardButtons.nth(i).click();
    }
    await page.getByTestId('confirm-payment-btn').click();

    await expect(page.getByTestId('payment-prompt')).toBeHidden();
    // The demand was spent while the prompt was up — it never replays.
    await expect(page.getByTestId('moment-callout')).toHaveCount(0);

    // Self-initiated payment: the payer never gets a "You paid" notice (moments/store.ts ingest).
    const seat3NoticeTexts = await page.getByTestId('notice').allTextContents();
    expect(seat3NoticeTexts.some((t) => /you paid/i.test(t))).toBe(false);

    await page.keyboard.press('1');
    await expect(page.getByTestId('notice').first()).toContainText(/Marcus paid you/i);
  });

  test('just say no — callout while the prompt still shows the threat', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'doubleJustSayNoChain');

    await page.keyboard.press('2');

    const jsnPrompt = page.getByTestId('jsn-prompt');
    await expect(jsnPrompt).toBeVisible();
    await expect(jsnPrompt).toContainText(/Aarav demands/i);
    await expect(jsnPrompt.locator('.playing-card')).toHaveCount(1);

    await page.getByTestId('jsn-play-jsn_b').click();

    const callout = page.getByTestId('moment-callout');
    await expect(callout).toBeVisible();
    await expect(callout).toHaveAttribute('data-kind', 'just_say_no');
    await expect(callout).toContainText(/JUST SAY NO/i);
    // Priya (p2, this fixture's respondent) is the one playing jsn_b — the
    // plan's draft named "Marcus" here, but derive.ts/copy.ts + the fixture's
    // pendingStack (respondentId: 'p2') agree the blocker is Priya, not Marcus.
    await expect(callout).toContainText(/You say NO to Aarav/i);

    await expect(callout).toBeHidden({ timeout: 6000 });
    await page.keyboard.press('1');

    const victimCallout = page.getByTestId('moment-callout');
    await expect(victimCallout).toContainText(/Priya says NO to your/i);
    await expect(page.getByTestId('notice').first()).toContainText(/Priya says NO to your/i);
  });

  test('birthday coalesces into one actor callout', async ({ page }) => {
    await page.goto('/demo');
    await loadFixture(page, 'parallelBirthdayCollection');

    await dragCardToZone(page, 'hand-card-bd1', 'discard-drop');

    const callout = page.getByTestId('moment-callout');
    await expect(callout).toBeVisible();
    await expect(callout).toHaveAttribute('data-kind', 'birthday');
    await expect(callout).toContainText(/Everyone owes you/i);

    // Never briefly renders a second callout for the coalesced batch.
    for (let i = 0; i < 5; i++) {
      expect(await page.getByTestId('moment-callout').count()).toBeLessThanOrEqual(1);
      await page.waitForTimeout(100);
    }

    // Payers get the payment prompt, not a "wants … from you" notice: since
    // a203979 birthday/rent/debt collector moments no longer create notices,
    // and notices stay hidden while the viewer is choosing a payment.
    await page.keyboard.press('2');
    await expect(page.getByTestId('payment-prompt-p2')).toBeVisible();
    await expect(page.getByTestId('notice')).toHaveCount(0);
  });

  test.describe('phone viewport', () => {
    test('feed badge counts unseen moments, clears on open', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/demo');

      // Dev controls live inside the drawer, which starts collapsed on a
      // phone board — open it once to pick the fixture, then close it again
      // so the feed badge (only rendered while collapsed) can be read.
      await page.getByLabel('Open table feed').click();
      await loadFixture(page, 'responsiveMidGame');
      await page.getByLabel('Collapse table feed').click();

      const badge = page.getByTestId('feed-badge');
      const readBadge = async () => ((await badge.count()) > 0 ? Number(await badge.innerText()) : 0);
      const before = await readBadge();

      await dragCardToZone(page, 'hand-card-sd1', 'discard-drop');
      await page.getByTestId('steal-card-u1').click();

      await expect.poll(readBadge).toBeGreaterThan(before);

      await page.getByLabel('Open table feed').click();
      await page.getByLabel('Collapse table feed').click();

      await expect(badge).toHaveCount(0);
    });
  });

  test.describe('reduced motion', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } });

    test('callout still shows', async ({ page }) => {
      await page.goto('/demo');
      await loadFixture(page, 'responsiveMidGame');

      await dragCardToZone(page, 'hand-card-sd1', 'discard-drop');
      await page.getByTestId('steal-card-u1').click();

      const callout = page.getByTestId('moment-callout');
      await expect(callout).toBeVisible();
      await expect(callout).toContainText(/SLY DEAL/i);
      await expect(callout).toContainText(/You took Marcus's/i);
    });
  });
});
