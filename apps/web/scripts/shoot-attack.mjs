// Attack-notice QA harness. Drives /local (pass-and-play) against the running
// dev server, performs a scripted attack, and screenshots at a chosen delay.
//
// Usage:
//   node shoot-attack.mjs --vp 1440x900 --scenario slydeal --delay 500 --out /path/x.png
//   node shoot-attack.mjs --vp 390x844  --scenario dealbreaker --seat 2 --delay 300 --out /path/y.png
//
// Scenarios (all start from /local and load the named fixture):
//   board        responsiveMidGame, no action — the plain table
//   slydeal      responsiveMidGame: p1 drags sd1 (Sly Deal) to discard, steals p3's u1 (utility) — p3 is seat 3, "Marcus"
//   forceddeal   responsiveMidGame: seat 3 (p3) plays fd1 — swaps own card for p2's pk1
//   dealbreaker  dealBreakerOnSetWithHotel: p1 drags dbk1, takes set_yellow_full from p2
//   debt         debtCollectorChoice: p1 drags dc1, targets p3 (payment prompt opens on p3's seat)
//   birthday     parallelBirthdayCollection: p1 drags bd1 (everyone owes 2)
//   jsn          doubleJustSayNoChain: p2 is asked; plays jsn_b (Just Say No)
//
// --seat N       after the action, switch the pass-and-play seat to N (1-based) before the delay
// --delay ms     wait after the action (and seat switch) before the screenshot; default 400
// --reduced      emulate prefers-reduced-motion
// --clip sel     screenshot only the element matching this CSS selector
//
// Requires the web dev server at 127.0.0.1:5173 (never start it yourself).
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const [w, h] = (args.vp ?? '1440x900').split('x').map(Number);
const scenario = args.scenario ?? 'board';
const delay = Number(args.delay ?? 400);
const out = args.out ?? `./shot-${scenario}-${w}x${h}.png`;
const BASE = 'http://127.0.0.1:5173';

async function dragCardToZone(page, cardTestId, dropTestId) {
  await page.evaluate(
    ({ cardId, dropId }) => {
      const card = document.querySelector(`[data-testid="${cardId}"]`);
      const drop = document.querySelector(`[data-testid="${dropId}"]`);
      if (!card || !drop) throw new Error(`DnD elements missing: ${cardId} -> ${dropId}`);
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('application/x-monopoly-card', card.getAttribute('data-card-id') ?? '');
      card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
      drop.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
      drop.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
      card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
    },
    { cardId: cardTestId, dropId: dropTestId },
  );
}

async function openFeed(page) {
  const fab = page.getByRole('button', { name: 'Open table feed' });
  if (await fab.count()) await fab.click();
}
async function closeFeed(page) {
  const btn = page.getByRole('button', { name: 'Collapse table feed' });
  if (await btn.count()) await btn.click();
}
async function loadFixture(page, name) {
  await openFeed(page);
  await page.locator('select[aria-label="Dev scenario"]').selectOption(name);
  await page.waitForTimeout(150);
  await closeFeed(page);
}
async function setSeat(page, oneBased) {
  await page.keyboard.press(String(oneBased));
  await page.waitForTimeout(100);
}

const SCENARIOS = {
  async board(page) {
    await loadFixture(page, 'responsiveMidGame');
  },
  async slydeal(page) {
    await loadFixture(page, 'responsiveMidGame');
    await dragCardToZone(page, 'hand-card-sd1', 'discard-drop');
    await page.getByTestId('steal-card-u1').click();
  },
  async forceddeal(page) {
    await loadFixture(page, 'responsiveMidGame');
    // p1 must end turn twice to reach p3; simpler: it is p1's turn in the fixture, so
    // play from p1 is not possible for fd1 (p3's card). Use seat 3 only if the engine
    // allows — otherwise fall back to sly deal. Left as an exercise: prefer slydeal.
    throw new Error('forceddeal needs a fixture where the acting seat holds fd1');
  },
  async dealbreaker(page) {
    await loadFixture(page, 'dealBreakerOnSetWithHotel');
    await dragCardToZone(page, 'hand-card-dbk1', 'discard-drop');
    await page.getByTestId('deal-breaker-set-set_yellow_full').click();
  },
  async debt(page) {
    await loadFixture(page, 'debtCollectorChoice');
    await dragCardToZone(page, 'hand-card-dc1', 'discard-drop');
    await page.getByTestId('debt-collector-player-p3').click();
  },
  async birthday(page) {
    await loadFixture(page, 'parallelBirthdayCollection');
    await dragCardToZone(page, 'hand-card-bd1', 'discard-drop');
  },
  async jsn(page) {
    await loadFixture(page, 'doubleJustSayNoChain');
    await setSeat(page, 2);
    await page.getByTestId('jsn-play-jsn_b').click();
  },
};

async function main() {
  await mkdir(dirname(out), { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 1,
      reducedMotion: args.reduced === 'true' ? 'reduce' : 'no-preference',
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
    await page.goto(`${BASE}/local`, { waitUntil: 'networkidle' });
    const run = SCENARIOS[scenario];
    if (!run) throw new Error(`unknown scenario ${scenario}`);
    await run(page);
    if (args.seat) await setSeat(page, Number(args.seat));
    await page.waitForTimeout(delay);
    if (args.clip) {
      await page.locator(args.clip).first().screenshot({ path: out });
    } else {
      await page.screenshot({ path: out });
    }
    console.log(`saved ${out}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
