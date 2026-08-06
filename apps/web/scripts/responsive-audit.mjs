// Dev-only checker: loads /local with the responsiveMidGame fixture at each
// target viewport and reports page-level horizontal overflow, console errors,
// and any interactive element under 44x44 CSS px.
import { chromium } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:5173';
const FIXTURE = 'responsiveMidGame';

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '414x896', width: 414, height: 896 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1440x900', width: 1440, height: 900 },
];

async function main() {
  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await page.goto(`${BASE_URL}/local`, { waitUntil: 'networkidle' });
      await page.locator('select[aria-label="Dev scenario"]').selectOption(FIXTURE);
      await page.waitForTimeout(200);

      const overflow = await page.evaluate(() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        return { docWidth, winWidth, overflows: docWidth > winWidth };
      });

      const smallTargets = await page.evaluate(() => {
        const selectors = [
          'button',
          '[role="button"]',
          'a[href]',
          '[data-testid$="-btn"]',
          '[data-testid="draw-pile"]',
        ];
        const seen = new Set();
        const results = [];
        for (const sel of selectors) {
          for (const el of document.querySelectorAll(sel)) {
            if (seen.has(el)) continue;
            seen.add(el);
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.width < 44 || r.height < 44) {
              results.push({
                tag: el.tagName,
                testid: el.getAttribute('data-testid'),
                cls: el.className?.toString().slice(0, 60),
                w: Math.round(r.width),
                h: Math.round(r.height),
              });
            }
          }
        }
        return results;
      });

      console.log(`\n=== ${vp.name} ===`);
      console.log('horizontal overflow:', overflow.overflows, overflow);
      console.log('console/page errors:', errors.length ? errors : 'none');
      console.log('sub-44px interactive targets:', smallTargets.length);
      for (const t of smallTargets) {
        console.log(`  ${t.tag} testid=${t.testid ?? '-'} class="${t.cls}" ${t.w}x${t.h}`);
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
