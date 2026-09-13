import { expect, test } from '@playwright/test';

const directions = ['01 Club', '02 Party', '03 City', '04 Night'];

test('all four designs keep navigation and actions reachable on mobile', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/scratchpad');
  for (const viewport of [{ width: 320, height: 667 }, { width: 360, height: 740 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    for (const direction of directions) {
      await page.getByRole('button', { name: direction, exact: true }).click();
      await expect(page.getByRole('button', { name: direction, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'End turn →', exact: true })).toBeInViewport();
      const geometry = await page.evaluate(() => ({
        overflow: document.querySelector('.lab')!.scrollWidth - innerWidth,
        cards: [...document.querySelectorAll<HTMLElement>('.playing-card')].map((c) => ({ width: c.offsetWidth, height: c.offsetHeight })),
      }));
      expect(geometry.overflow, `${direction} at ${viewport.width}`).toBeLessThanOrEqual(1);
      for (const card of geometry.cards) expect(Math.abs(card.width / card.height - 5 / 7)).toBeLessThan(.02);
      if (viewport.width === 390) await page.screenshot({ path: info.outputPath(`${direction.slice(3)}.png`) });
    }
  }
  expect(errors).toEqual([]);
});

test('builds, celebrates, shares progress between designs, and resets after victory', async ({ page }) => {
  await page.goto('/scratchpad');
  await page.getByRole('button', { name: 'Select Surat', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '＋ Add to collection', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Gujarat complete! 1/3 sets');
  await page.getByRole('button', { name: '03 City', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your neighbourhoods 1/3 sets' })).toBeVisible();
  for (const name of ['Select Silchar', 'Select Karnataka / Uttar Pradesh']) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: '＋ Add to collection', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: /You built an empire/ })).toBeVisible();
  await page.getByRole('button', { name: 'Play again ↻', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your hand 5', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your neighbourhoods 0/3 sets' })).toBeVisible();
});

test('banks a card, requests rent, locks play while waiting, and shows the activity', async ({ page }) => {
  await page.goto('/scratchpad');
  await page.getByRole('button', { name: 'Select ₹5Cr', exact: true }).click();
  await page.getByRole('button', { name: 'Bank ₹5Cr', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspect your bank, ₹11Cr', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select Rent Gujarat/Kerala', exact: true }).click();
  await page.getByRole('button', { name: 'Request rent · ₹1Cr each', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Rent requested');
  await page.getByRole('button', { name: 'End turn →', exact: true }).click();
  await page.getByRole('button', { name: 'Select Surat', exact: true }).click();
  await expect(page.getByRole('button', { name: '＋ Add to collection', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open table activity', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Banked ₹5Cr');
  await expect(page.getByRole('dialog')).toContainText('Rent requested');
});

test('supports two to five seats and inspecting an opponent', async ({ page }) => {
  await page.goto('/scratchpad');
  for (const count of [2, 5]) {
    await page.getByRole('button', { name: 'Table settings', exact: true }).click();
    await page.getByLabel('Players at the table').selectOption(String(count));
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(page.locator('.lab-rival')).toHaveCount(count - 1);
  }
  await page.getByRole('button', { name: 'Inspect Alex, 7 cards, bank ₹21Cr', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Alex’s table');
  await expect(page.getByRole('dialog').locator('.playing-card')).toHaveCount(8);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
