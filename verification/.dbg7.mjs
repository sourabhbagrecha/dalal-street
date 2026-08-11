import { chromium, devices } from '@playwright/test';
const b = await chromium.launch();
const c = await b.newContext({ ...devices['iPhone 15 Pro'], viewport: { width: 852, height: 393 }, deviceScaleFactor: 2 });
const p = await c.newPage();
await p.route('**/pages/new*Design/**/*.css*', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
await p.goto('http://127.0.0.1:5173/demo', { waitUntil: 'networkidle' });
await p.waitForSelector('.game-board', { timeout: 20000 });
await p.waitForTimeout(1500);
await p.addStyleTag({ content: '.app::before{content:"";display:block;height:40px;flex:0 0 40px;background:#14110e}' });
await p.waitForTimeout(600);
const info = await p.evaluate(() => {
  const gb = document.querySelector('.game-board');
  const gbr = gb.getBoundingClientRect();
  const out = { gb: { scrollH: gb.scrollHeight, clientH: gb.clientHeight, top: Math.round(gbr.top), bottom: Math.round(gbr.bottom) }, rows: [] };
  for (const sel of ['.opponent-rail', '.game-center', '.game-board__panels', '.hand-area']) {
    const el = gb.querySelector(sel);
    const r = el.getBoundingClientRect();
    out.rows.push({ sel, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) });
  }
  return out;
});
console.log(JSON.stringify(info, null, 1));
await b.close();
