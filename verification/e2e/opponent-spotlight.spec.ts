import { expect, test, type Page } from '@playwright/test';

/**
 * Once it's an opponent's turn, `BoardTopRegion` swaps the opponent rail +
 * table centre for a single expanded `OpponentSpotlight` of whoever's acting
 * — see the "Opponent spotlight" section of the mobile layout work, later
 * extended to desktop too (see `spotlitOpponent` in BoardTopRegion.tsx). This
 * spec locks in the shape of that swap at every viewport it applies to: what
 * disappears, what takes its place, and that the rest of the board (own
 * properties, own hand) never gets crushed to make room.
 *
 * The desktop describe blocks below exist specifically because `.game-board`'s
 * *base* template (>700px wide, >760px tall) uses a flexible `fr` row for the
 * spotlight's row 2 — the one case `.game-board--spotlight`'s CSS override
 * (styles.css, next to `.opponent-spotlight`) exists to fix; see that
 * comment for why a flexible track under a spanning item is unsafe.
 *
 * Card-ratio/clip correctness for the spotlight's board cards lives in
 * card-aspect-ratio.spec.ts instead, so its webkit project covers them too.
 */

async function loadStandardMidGame(page: Page) {
  // standardMidGame gives p2 (the seat that ends up active after one END
  // TURN) a real one-card brown set — deterministic content to assert
  // against, unlike /local's own default deal, which is real-shuffled. The
  // table feed is a collapsed drawer only below the phone width breakpoint
  // (styles.css `.side-panel__fab`) — above it the dev scenario select is
  // already on-screen with no drawer to open or collapse.
  const openFeed = page.getByRole('button', { name: 'Open table feed' });
  if (await openFeed.isVisible().catch(() => false)) {
    await openFeed.click();
    await page.getByLabel('Dev scenario').selectOption('standardMidGame');
    await page.getByRole('button', { name: 'Collapse table feed' }).click();
  } else {
    await page.getByLabel('Dev scenario').selectOption('standardMidGame');
  }
}

async function endTurn(page: Page) {
  await page.getByTestId('end-turn-btn').click();
  await expect(page.getByTestId('opponent-spotlight')).toBeVisible();
}

test.describe('opponent spotlight (phone)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 659 });
    await page.goto('/local');
    await expect(page.getByTestId('hand-fan')).toBeVisible();
    await loadStandardMidGame(page);
  });

  test('shows the rail and table centre on the viewer\'s own turn, not the spotlight', async ({
    page,
  }) => {
    await expect(page.locator('.opponent-rail')).toBeVisible();
    await expect(page.getByTestId('draw-pile')).toBeVisible();
    await expect(page.getByTestId('opponent-spotlight')).toHaveCount(0);
  });

  test('replaces the rail and table centre once it becomes an opponent\'s turn', async ({
    page,
  }) => {
    await endTurn(page);

    await expect(page.getByTestId('opponent-spotlight')).toBeVisible();
    await expect(page.locator('.opponent-rail')).toHaveCount(0);
    await expect(page.getByTestId('draw-pile')).toHaveCount(0);
    await expect(page.getByTestId('discard-drop')).toHaveCount(0);
    await expect(page.getByTestId('turn-banner')).toHaveCount(0);
  });

  test('never shrinks the own board or hand below their template floors', async ({ page }) => {
    await endTurn(page);

    // Floors from .game-board's max-width:700px template (styles.css) — the
    // one thing this whole feature must never do is buy the spotlight room
    // by starving the tracks below it.
    const panels = await page.getByTestId('properties-drop').boundingBox();
    const hand = await page.getByTestId('hand-fan').boundingBox();
    expect(panels?.height ?? 0).toBeGreaterThanOrEqual(120);
    expect(hand?.height ?? 0).toBeGreaterThanOrEqual(150);

    const overflow = await page.evaluate(() => {
      const board = document.querySelector('.game-board')!;
      return board.scrollHeight <= board.clientHeight + 1;
    });
    expect(overflow).toBe(true);
  });

  test('a dense board scrolls only its own sets list, leaving the header pinned', async ({
    page,
  }) => {
    await endTurn(page);

    const result = await page.evaluate(() => {
      const sets = document.querySelector<HTMLElement>('.opponent-spotlight__sets')!;
      const original = sets.querySelector('.property-set-view')!;
      for (let i = 0; i < 6; i++) sets.appendChild(original.cloneNode(true));

      const canScroll = sets.scrollHeight > sets.clientHeight;
      const headerBefore = document
        .querySelector('.opponent-spotlight__header')!
        .getBoundingClientRect().top;
      sets.scrollTop = 9999;
      const scrolled = sets.scrollTop > 0;
      const headerAfter = document
        .querySelector('.opponent-spotlight__header')!
        .getBoundingClientRect().top;
      const board = document.querySelector('.game-board')!;
      return {
        canScroll,
        scrolled,
        headerUnmoved: headerBefore === headerAfter,
        boardNeverOverflows: board.scrollHeight <= board.clientHeight + 1,
      };
    });

    expect(result.canScroll).toBe(true);
    expect(result.scrolled).toBe(true);
    expect(result.headerUnmoved).toBe(true);
    expect(result.boardNeverOverflows).toBe(true);
  });

  test('tapping a peer chip opens the read-only inspect modal for that player', async ({
    page,
  }) => {
    await endTurn(page);

    await page.locator('[data-testid^="opponent-peer-"]').first().click();
    await expect(page.getByTestId('opponent-inspect-overlay')).toBeVisible();
  });

  test('dims and disables pointer events under an interrupt prompt', async ({ page }) => {
    await endTurn(page);

    // Exercising the CSS coupling directly (:has(.game-prompt)) rather than
    // driving a real payment/Just-Say-No flow — that flow's own correctness
    // is covered elsewhere (parallel-payment.spec.ts, just-say-no.spec.ts);
    // this only needs to prove the spotlight reacts to a prompt being up.
    await page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'game-prompt';
      el.setAttribute('data-testid', 'synthetic-prompt-probe');
      document.querySelector('.app')!.appendChild(el);
    });

    const spotlight = page.locator('.opponent-spotlight');
    await expect(spotlight).toHaveCSS('opacity', '0.45');
    await expect(spotlight).toHaveCSS('pointer-events', 'none');

    await page.evaluate(() => {
      document.querySelector('[data-testid="synthetic-prompt-probe"]')?.remove();
    });
    await expect(spotlight).toHaveCSS('opacity', '1');
  });
});

test.describe('opponent spotlight (landscape phone)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.goto('/local');
    await expect(page.getByTestId('hand-fan')).toBeVisible();
    await loadStandardMidGame(page);
    await endTurn(page);
  });

  test('still meets the landscape template\'s own-board and hand floors', async ({ page }) => {
    // Floors from .game-board's max-height:520px landscape template.
    const panels = await page.getByTestId('properties-drop').boundingBox();
    const hand = await page.getByTestId('hand-fan').boundingBox();
    expect(panels?.height ?? 0).toBeGreaterThanOrEqual(96);
    expect(hand?.height ?? 0).toBeGreaterThanOrEqual(100);

    const overflow = await page.evaluate(() => {
      const board = document.querySelector('.game-board')!;
      return board.scrollHeight <= board.clientHeight + 1;
    });
    expect(overflow).toBe(true);
  });
});

test.describe('opponent spotlight (desktop, 1280x720)', () => {
  // Height 720 is <=760, so .game-board is still on the same non-flexible
  // `auto auto minmax(150px, 21dvh) minmax(140px, 33dvh)` template every
  // short viewport gets (styles.css ~4155) — `.game-board--spotlight`'s
  // media query (min-height: 761px) doesn't fire here. This block exists to
  // prove the desktop swap works even where that fix is a no-op.
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/local');
    await expect(page.getByTestId('hand-fan')).toBeVisible();
    await loadStandardMidGame(page);
  });

  test('replaces the rail and table centre once it becomes an opponent\'s turn', async ({
    page,
  }) => {
    await expect(page.locator('.opponent-rail')).toBeVisible();
    await expect(page.getByTestId('opponent-spotlight')).toHaveCount(0);

    await endTurn(page);

    await expect(page.getByTestId('opponent-spotlight')).toBeVisible();
    await expect(page.locator('.opponent-rail')).toHaveCount(0);
    await expect(page.getByTestId('draw-pile')).toHaveCount(0);
    await expect(page.getByTestId('turn-banner')).toHaveCount(0);
  });

  test('never shrinks the own board or hand below their template floors', async ({ page }) => {
    await endTurn(page);

    const panels = await page.getByTestId('properties-drop').boundingBox();
    const hand = await page.getByTestId('hand-fan').boundingBox();
    expect(panels?.height ?? 0).toBeGreaterThanOrEqual(150);
    expect(hand?.height ?? 0).toBeGreaterThanOrEqual(140);

    // A wider tolerance than the phone specs use: the single-row desktop
    // hand fan bleeds a few px past its own box even with no spotlight
    // involved at all (same diff pre-existing on the viewer's own turn at
    // this viewport) — .game-board's overflow:hidden still clips it visually.
    const overflow = await page.evaluate(() => {
      const board = document.querySelector('.game-board')!;
      return board.scrollHeight <= board.clientHeight + 6;
    });
    expect(overflow).toBe(true);
  });
});

test.describe('opponent spotlight (desktop, 1280x900 — flexible-row fix)', () => {
  // Height 900 is >760, so without `.game-board--spotlight` this is the base
  // template with a *flexible* row 2 (`minmax(110px, 0.7fr)`) — the exact
  // case the CSS fix targets. This is the one block that actually exercises
  // it; the 1280x720 block above does not.
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/local');
    await expect(page.getByTestId('hand-fan')).toBeVisible();
    await loadStandardMidGame(page);
  });

  test('replaces the rail and table centre once it becomes an opponent\'s turn', async ({
    page,
  }) => {
    await endTurn(page);

    await expect(page.getByTestId('opponent-spotlight')).toBeVisible();
    await expect(page.locator('.opponent-rail')).toHaveCount(0);
    await expect(page.getByTestId('draw-pile')).toHaveCount(0);
  });

  test('never shrinks the own board or hand below their template floors', async ({ page }) => {
    await endTurn(page);

    // Row 3's floor (`minmax(100px, 1fr)`) is the one number the base
    // template guarantees regardless of how .game-board--spotlight sizes
    // rows 1+2 — the fix must never eat into it.
    const panels = await page.getByTestId('properties-drop').boundingBox();
    const hand = await page.getByTestId('hand-fan').boundingBox();
    expect(panels?.height ?? 0).toBeGreaterThanOrEqual(100);
    expect(hand?.height ?? 0).toBeGreaterThan(0);

    // See the 1280x720 block above for why this tolerance is wider than the
    // phone specs' — pre-existing single-row hand-fan bleed, not spotlight.
    const overflow = await page.evaluate(() => {
      const board = document.querySelector('.game-board')!;
      return board.scrollHeight <= board.clientHeight + 6;
    });
    expect(overflow).toBe(true);
  });

  test('a dense board scrolls only its own sets list, leaving the header pinned', async ({
    page,
  }) => {
    await endTurn(page);

    const result = await page.evaluate(() => {
      const sets = document.querySelector<HTMLElement>('.opponent-spotlight__sets')!;
      const original = sets.querySelector('.property-set-view')!;
      // Desktop's wider, flex-wrap sets area fits more per row than a phone's,
      // so this needs far more clones than the phone spec's 6 to force a
      // genuine overflow rather than exercising an already-generous fit.
      for (let i = 0; i < 40; i++) sets.appendChild(original.cloneNode(true));

      const canScroll = sets.scrollHeight > sets.clientHeight;
      const headerBefore = document
        .querySelector('.opponent-spotlight__header')!
        .getBoundingClientRect().top;
      sets.scrollTop = 9999;
      const scrolled = sets.scrollTop > 0;
      const headerAfter = document
        .querySelector('.opponent-spotlight__header')!
        .getBoundingClientRect().top;
      const board = document.querySelector('.game-board')!;
      return {
        canScroll,
        scrolled,
        headerUnmoved: headerBefore === headerAfter,
        boardNeverOverflows: board.scrollHeight <= board.clientHeight + 6,
      };
    });

    expect(result.canScroll).toBe(true);
    expect(result.scrolled).toBe(true);
    expect(result.headerUnmoved).toBe(true);
    expect(result.boardNeverOverflows).toBe(true);
  });

  test('tapping a peer chip opens the read-only inspect modal for that player', async ({
    page,
  }) => {
    await endTurn(page);

    await page.locator('[data-testid^="opponent-peer-"]').first().click();
    await expect(page.getByTestId('opponent-inspect-overlay')).toBeVisible();
  });
});
