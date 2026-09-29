import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  /* Every test deals its own /demo room, so tests share nothing and run
     side by side. */
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 4,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    /* A click that cannot land fails in seconds instead of waiting out the whole test. */
    actionTimeout: 10_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    /* Card sizing (see card-aspect-ratio.spec.ts) is the one place the two
       engines disagree: Chromium clips content that overflows a card's
       aspect-ratio box, WebKit lets the box grow past it instead — a
       Chromium-only run stays green through the exact regression this suite
       exists to catch. Scoped to that one file via testMatch so the rest of
       the suite, tuned against Chromium, doesn't pay to run twice, and to its
       geometry tests: the `@css-audit` test reads stylesheet rules, which do
       not differ by engine. Needs `playwright install webkit` once per machine. */
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: /card-aspect-ratio\.spec\.ts/,
      grepInvert: /@css-audit/,
    },
  ],
  webServer: {
    command: 'pnpm --filter @monopoly-deal/web dev --host 127.0.0.1 --port 5173',
    cwd: '../..',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      // Turnstile isn't registered for 127.0.0.1 — force the widget off so
      // create-room stays clickable without a captcha round trip.
      VITE_TURNSTILE_SITE_KEY: '',
    },
  },
});
