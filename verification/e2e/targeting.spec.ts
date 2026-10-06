import { expect, test } from '@playwright/test';
import { dragCardToZone } from './helpers/dnd';
import { openDemo, switchSeat } from './helpers/demo';

/**
 * Aiming an action on the felt table: a banner over the camera says what is
 * being picked, a tap on a rival's seat zooms in on them, and the pick is then
 * confirmed on their seat (the round TAKE/CHARGE button for a player, the set
 * tile itself for a Deal Breaker).
 */
test.describe('targeting', () => {
  test('debt collector prompts player choice', async ({ page }) => {
    await openDemo(page, 'debtCollectorChoice');

    await dragCardToZone(page, 'hand-card-dc1', 'discard-drop');

    await expect(page.getByTestId('debt-collector-prompt')).toBeVisible();
    await expect(page.getByTestId('debt-collector-player-p2')).toBeVisible();
    await expect(page.getByTestId('debt-collector-player-p3')).toBeVisible();

    // Tap Marcus's seat, then TAKE on it.
    await page.getByTestId('debt-collector-player-p3').click();
    await expect(page.getByTestId('opponent-spotlight')).toHaveAttribute('data-player-id', 'p3');
    await page.getByRole('button', { name: /TAKE/ }).click();

    // Table feed shows display names, not raw ids — seat index 2 (p3) is "Marcus".
    await expect(page.getByTestId('table-feed')).toContainText(/marcus/i);
    await expect(page.getByTestId('table-feed')).toContainText(/debt|5M|\$5|₹5/i);
  });

  test('debt collector with a single rival charges them without asking', async ({ page }) => {
    await openDemo(page, 'debtCollectorSoleRival');

    await dragCardToZone(page, 'hand-card-dc1', 'discard-drop');

    // No "who pays" pick and no TAKE tap: the only rival is charged straight away.
    await expect(page.getByTestId('table-feed')).toContainText(/debt|5M|\$5|₹5/i);
    await expect(page.getByTestId('debt-collector-prompt')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /TAKE/ })).toHaveCount(0);
  });

  test('sly deal picks a rival and a card on one screen', async ({ page }) => {
    await openDemo(page, 'slyDealPick');

    await dragCardToZone(page, 'hand-card-sd1', 'discard-drop');

    // One screen, no camera round the felt: the first rival with something to take is already open, and the ones with
    // nothing are greyed out.
    const picker = page.getByTestId('steal-picker');
    await expect(page.getByTestId('steal-target-prompt')).toBeVisible();
    await expect(picker).toBeVisible();
    await expect(page.getByTestId('steal-rival-p2')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('steal-rival-p4')).toBeDisabled();
    // Priya's loose properties are cards to tap; her complete Gujarat set is not on offer.
    for (const id of ['r1', 'r2', 'lb1']) await expect(page.getByTestId(`steal-card-${id}`)).toBeVisible();
    await expect(page.getByTestId('steal-card-b1')).toHaveCount(0);
    await expect(picker).toContainText('1 complete set can’t be taken');

    // Nothing spills sideways at any phone width, and the cards keep their 5:7 shape.
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const fits = await page.getByTestId('steal-body').evaluate((el) => el.scrollWidth <= el.clientWidth);
      expect(fits, `no sideways spill at ${width}px`).toBe(true);
      const box = await page.getByTestId('steal-card-r1').boundingBox();
      expect(box!.width / box!.height).toBeCloseTo(5 / 7, 1);
    }

    // Switch rival, then take a wild from Marcus's North East set.
    await page.getByTestId('steal-rival-p3').click();
    await expect(page.getByTestId('steal-card-r1')).toHaveCount(0);
    await page.getByTestId('steal-card-w1').click();

    // A tap only lines the card up: the banner asks, the rest step back, and nothing is played until the round button is pressed.
    await expect(page.getByTestId('steal-target-prompt')).toContainText(/Steal .* from Marcus\?/);
    await expect(page.getByTestId('steal-card-o1')).toHaveAttribute('data-dim', 'true');
    await page.getByTestId('confirm-pick-btn').click({ force: true });

    // Marcus is always asked, holding a Just Say No or not; he lets it go.
    await switchSeat(page, 2);
    await page.getByTestId('jsn-decline-btn').click();
    await switchSeat(page, 0);
    await expect(page.getByTestId('properties-drop')).toContainText(/Meghalaya|Wild/i);
  });

  test('deal breaker lines a whole set up, then takes it on confirm', async ({ page }) => {
    await openDemo(page, 'dealBreakerPick');

    await dragCardToZone(page, 'hand-card-dbk1', 'discard-drop');

    // One screen like Sly Deal: a rival with no complete set is greyed out, the first with one is open, its set laid out whole.
    await expect(page.getByTestId('deal-breaker-prompt')).toBeVisible();
    await expect(page.getByTestId('steal-picker')).toBeVisible();
    await expect(page.getByTestId('steal-rival-p4')).toBeDisabled();
    await expect(page.getByTestId('steal-rival-p2')).toHaveAttribute('aria-pressed', 'true');

    // Tapping the set only lines it up (nothing is sent yet): Marcus's brown set is not on offer under Priya.
    await page.getByTestId('deal-breaker-set-set_yellow_full').click();
    await expect(page.getByTestId('deal-breaker-prompt')).toContainText(/Take Priya.s .* set\?/);
    await expect(page.getByTestId('deal-breaker-prompt')).toHaveAttribute('data-final', 'true');
    await expect(page.getByTestId('deal-breaker-set-set_yellow_full')).toHaveAttribute('aria-pressed', 'true');

    // Tapping it again puts it back; switching rival drops the pick.
    await page.getByTestId('deal-breaker-set-set_yellow_full').click();
    await expect(page.getByTestId('confirm-pick-btn')).toHaveCount(0);
    await page.getByTestId('deal-breaker-set-set_yellow_full').click();
    await page.getByTestId('steal-rival-p3').click();
    await expect(page.getByTestId('confirm-pick-btn')).toHaveCount(0);
    await page.getByTestId('steal-rival-p2').click();
    await page.getByTestId('deal-breaker-set-set_yellow_full').click();
    await page.getByTestId('confirm-pick-btn').click({ force: true });

    // Priya is always asked, holding a Just Say No or not; she lets it go.
    await switchSeat(page, 1);
    await page.getByTestId('jsn-decline-btn').click();
    await expect(page.getByTestId('table-feed')).toContainText(/deal-broke|deal_breaker/i);
    await switchSeat(page, 0);

    // The viewer's seat shows city names, not a written color label — check a
    // stolen yellow-set (Tamil Nadu) card landed on the actor's board instead.
    await expect(page.getByTestId('properties-drop')).toContainText(
      /Chennai|Madurai|Thanjavur/i,
    );
  });

  test('forced deal: give, get, then confirm the swap', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDemo(page, 'forcedDealPick');

    await dragCardToZone(page, 'hand-card-fd1', 'discard-drop');

    // Step 1: your own tradeable properties as big cards; the complete brown set is not on offer.
    await expect(page.getByTestId('forced-deal-prompt')).toHaveAttribute('data-step', '1');
    await expect(page.getByTestId('steal-picker')).toContainText('1 complete set can’t be traded');
    for (const id of ['y1', 'y2', 'g1']) await expect(page.getByTestId(`steal-card-${id}`)).toBeVisible();
    await expect(page.getByTestId('steal-card-b1')).toHaveCount(0);
    await page.getByTestId('steal-card-y1').click();

    // Step 2: what you give stays in view; pick theirs. A tap lines it up, it does not play it.
    await expect(page.getByTestId('forced-deal-prompt')).toHaveAttribute('data-step', '2');
    await expect(page.getByTestId('forced-deal-give')).toBeVisible();
    await page.getByTestId('forced-deal-regive').click();
    await expect(page.getByTestId('forced-deal-prompt')).toHaveAttribute('data-step', '1');
    await page.getByTestId('steal-card-g1').click();
    await page.getByTestId('steal-card-r1').click();
    await expect(page.getByTestId('forced-deal-prompt')).toHaveAttribute('data-step', '3');
    await expect(page.getByTestId('forced-deal-prompt')).toHaveAttribute('data-final', 'true');
    await expect(page.getByTestId('forced-deal-prompt')).toBeVisible();

    // Step 3: the round button swaps. Priya is always asked; she lets it go.
    await page.getByTestId('confirm-pick-btn').click({ force: true });
    await switchSeat(page, 1);
    await page.getByTestId('jsn-decline-btn').click();
    await switchSeat(page, 0);
    await expect(page.getByTestId('properties-drop')).toContainText(/Wild|Red|Mumbai|Delhi|Kolkata|Chennai|Jaipur/i);
  });
});
