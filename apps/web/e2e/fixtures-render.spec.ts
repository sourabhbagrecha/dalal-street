import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = [
  'standardMidGame',
  'oneSetFromWinning',
  'emptyHand',
  'overHandLimit',
  'rentWithEmptyBank',
  'dealBreakerOnSetWithHotel',
  'doubleJustSayNoChain',
  'payBreaksCompletedSet',
  'insufficientPayment',
] as const;

const OUT = join(process.cwd(), 'e2e-screenshots');

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

for (const fixture of FIXTURES) {
  test(`render ${fixture} all seats`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await page.locator('select[aria-label="Dev scenario"]').selectOption(fixture);
    await page.waitForTimeout(200);

    const seatButtons = page.locator('[data-seat]');
    const count = await seatButtons.count();
    expect(count).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < count; i++) {
      await seatButtons.nth(i).click();
      await page.waitForTimeout(100);
      await page.screenshot({
        path: join(OUT, `${fixture}-seat${i + 1}.png`),
        fullPage: true,
      });
    }

    expect(errors, errors.join('\n')).toEqual([]);
  });
}
