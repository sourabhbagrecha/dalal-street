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

    // Switch rival, then take a wild from Marcus's Assam set.
    await page.getByTestId('steal-rival-p3').click();
    await expect(page.getByTestId('steal-card-r1')).toHaveCount(0);
    await page.getByTestId('steal-card-w1').click();

    // Marcus is always asked, holding a Just Say No or not; he lets it go.
    await switchSeat(page, 2);
    await page.getByTestId('jsn-decline-btn').click();
    await switchSeat(page, 0);
    await expect(page.getByTestId('properties-drop')).toContainText(/Jorhat|Wild/i);
  });

  test('deal breaker steals complete set', async ({ page }) => {
    await openDemo(page, 'dealBreakerOnSetWithHotel');

    await dragCardToZone(page, 'hand-card-dbk1', 'discard-drop');

    await expect(page.getByTestId('deal-breaker-prompt')).toBeVisible();
    await page.getByTestId('opponent-peer-p2').click();
    // force: a pickable tile pulses (infinite animation), so it never reads as stable.
    await page.getByTestId('deal-breaker-set-set_yellow_full').click({ force: true });

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
});
