import { chromium, devices } from '@playwright/test';
const b = await chromium.launch();
const c = await b.newContext({ ...devices['iPhone 15 Pro'], viewport: { width: 852, height: 393 }, deviceScaleFactor: 2 });
const p = await c.newPage();
await p.route('**/pages/new*Design/**/*.css*', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
await p.goto('http://127.0.0.1:5173/demo', { waitUntil: 'networkidle' });
await p.waitForSelector('.game-board', { timeout: 20000 });
await p.selectOption('select', 'responsiveMidGame').catch(() => {});
await p.waitForTimeout(1500);
await p.addStyleTag({ content: '.app::before{content:"";display:block;height:40px;flex:0 0 40px;background:#14110e}' });
await p.waitForTimeout(600);
const info = await p.evaluate(() => {
  const gb = document.querySelector('.game-board');
  const gbr = gb.getBoundingClientRect();
  const out = { gbr: { top: Math.round(gbr.top), bottom: Math.round(gbr.bottom) }, els: [] };
  for (const el of document.querySelectorAll('.game-board *')) {
    const r = el.getBoundingClientRect();
    if (r.bottom > gbr.bottom + 1 || r.top < gbr.top - 1) {
      out.els.push({ cls: (el.className || el.tagName).toString().slice(0,50), top: Math.round(r.top), bottom: Math.round(r.bottom), over: Math.round(r.bottom - gbr.bottom) });
    }
  }
  return out;
});
console.log(JSON.stringify(info, null, 1));
await b.close();
