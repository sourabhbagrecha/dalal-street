// UI loop harness: screenshots the /local game screen (responsiveMidGame
// fixture) at fixed viewports into .screens/<iteration>/ (repo root).
// Usage: node apps/web/scripts/shoot.mjs <iteration-name>
// Requires the web dev server already running at 127.0.0.1:5173.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iteration = process.argv[2];
if (!iteration) {
  console.error('Usage: node scripts/shoot.mjs <iteration-name>');
  process.exitCode = 1;
  throw new Error('missing iteration name');
}

const ROOT_DIR = join(__dirname, '..', '..', '..');
const OUT_DIR = join(ROOT_DIR, '.screens', iteration);
const BASE_URL = 'http://127.0.0.1:5173';
const FIXTURE = 'responsiveMidGame';

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '414x896', width: 414, height: 896 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1440x900', width: 1440, height: 900 },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/local`, { waitUntil: 'networkidle' });
      await page.locator('select[aria-label="Dev scenario"]').selectOption(FIXTURE);
      await page.waitForTimeout(200);

      const outPath = join(OUT_DIR, `${vp.name}.png`);
      await page.screenshot({ path: outPath, fullPage: true });
      console.log(`saved ${outPath}`);

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
