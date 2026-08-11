// Scratch screenshot helper (untracked). Usage from repo root:
//   node verification/.shot.mjs <url> <outPath> [width] [height] [full]
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://127.0.0.1:5173/demo';
const out = process.argv[3] ?? 'shot.png';
const w = Number(process.argv[4] ?? 1440);
const h = Number(process.argv[5] ?? 900);
const full = process.argv[6] === 'full';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text());
});
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.screenshot({ path: out, fullPage: full });
console.log('saved', out);
await browser.close();
