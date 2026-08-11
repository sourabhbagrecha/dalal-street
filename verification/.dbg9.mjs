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
  const ha = document.querySelector('.hand-area');
  const hf = document.querySelector('.hand-fan');
  const probe = document.querySelector('.hand-fan__probe');
  const cs = getComputedStyle(ha);
  const hfR = hf.getBoundingClientRect();
  const probeR = probe.getBoundingClientRect();
  return {
    hcw: cs.getPropertyValue('--hand-card-w'),
    hch: cs.getPropertyValue('--hand-card-h'),
    hfR: { top: Math.round(hfR.top), bottom: Math.round(hfR.bottom), h: Math.round(hfR.height) },
    probeR: { top: Math.round(probeR.top), bottom: Math.round(probeR.bottom), h: Math.round(probeR.height) },
    haGridRows: getComputedStyle(ha).gridTemplateRows,
  };
});
console.log(JSON.stringify(info, null, 1));
await b.close();
