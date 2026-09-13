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

    await page.goto('/demo');
    await expect(page.getByTestId('hand-fan')).toBeVisible();
    // /demo deals a brand-new server room over the network for a fixture
    // switch (unlike the old /local pass-and-play's instant reprojection),
    // and the dev seat switcher goes briefly empty (playerCount momentarily
    // 0) while it lands. A DOM-visibility check can pass instantly against
    // the *old* fixture's still-mounted content, before React has even torn
    // it down — so wait on the actual network round-trip instead of a
    // visibility check that the old content could satisfy by coincidence.
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/dev/rooms/fixture') && res.status() === 200),
      page.locator('select[aria-label="Dev scenario"]').selectOption(fixture),
    ]);

    const seatButtons = page.locator('[data-seat]');
    // Not just toBeVisible(): the seat switcher renders 0 buttons for the
    // instant between the old room's teardown and the new room's first SSE
    // projection landing, and a single poll can land exactly there.
    await expect.poll(() => seatButtons.count(), { timeout: 8000 }).toBeGreaterThanOrEqual(2);
    const count = await seatButtons.count();

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
