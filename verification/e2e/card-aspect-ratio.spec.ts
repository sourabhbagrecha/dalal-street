import { expect, test, type Page } from '@playwright/test';

/**
 * Every playing card must render as a strict 5:7 (width:height) rectangle,
 * and its face content must never be visually clipped to make that happen —
 * see the "Card sizing" rule in CLAUDE.md.
 *
 * The regression this guards against is engine-specific: a card's box is
 * sized by `aspect-ratio` on a `display: flex; flex-direction: column`
 * element. When a card's own content (a rent table with more rows than
 * usual, e.g. a railroad-length 4-row set, doubled up on a two-colour
 * wildcard) needs more height than the ratio allows, Chromium quietly clips
 * it and keeps the box correct — Firefox and WebKit instead let the box grow
 * past the ratio to fit the content. Same underlying bug, and only one of
 * the two symptoms is visible in a Chromium-only check, which is why this
 * spec's `webkit` project run (see playwright.config.ts) is the one that
 * actually exercises it.
 */

const CARD_RATIO = 5 / 7; // width / height
// Integer px rounding at small rendered sizes (a few px on a ~70-200px card)
// is the only source of drift once the box is genuinely ratio-locked.
const RATIO_TOLERANCE = 0.015;

/** Widths spanning the hand fan's real range: MIN_CARD_SCALE-shrunk compact
 *  cards on a small phone, up to a roomy desktop hand. See HandFan.tsx. */
const WIDTHS = [64, 70, 80, 90, 101, 110, 123, 138, 160, 199];

function expectCardRatio(w: number, h: number, label: string) {
  expect(h, `${label}: card had zero height`).toBeGreaterThan(0);
  expect(
    Math.abs(w / h - CARD_RATIO),
    `${label}: expected 5:7 (${CARD_RATIO.toFixed(4)}) at ${w}x${h}px, got ${(w / h).toFixed(4)}`,
  ).toBeLessThan(RATIO_TOLERANCE);
}

interface ProbeResult {
  w: number;
  cardW: number;
  cardH: number;
  faceScrollH: number;
  faceClientH: number;
}

/**
 * Turns one real `.hand-fan__card` into the worst realistic case (a 4-row
 * rent table — railroad-length sets are the longest in the deck — plus a
 * long city name) and sweeps it across `WIDTHS`, reporting the rendered box
 * and whether its face content overflowed it.
 *
 * Strips the fan's rotate/hover transform before measuring: getBoundingClientRect
 * would otherwise report the rotated bounding box, not the card's actual
 * layout size, and falsely look off-ratio.
 */
async function probeWorstCaseProperty(page: Page): Promise<ProbeResult[]> {
  return page.evaluate((widths) => {
    const propCard = document.querySelector<HTMLElement>(
      '.hand-fan__card[data-card-kind="property"]',
    );
    if (!propCard) throw new Error('no property card in hand to probe');
    // India-design face (see indiaPropertyTheme.ts / PropertyLandmarks.tsx):
    // .playing-card__pcard-rows is the one region whose content height
    // actually depends on --rent-rows (the header — badge/tagline/price/
    // city — is fixed-size on every state, see --card-ref vs
    // --card-ref-rows in styles.css), and it's the element that actually
    // clips (it carries its own `overflow: hidden`), so it's the right
    // element to both pad and measure — not the outer face wrapper, whose
    // own scrollHeight wouldn't reflect an internal region's clipping.
    const rentList = propCard.querySelector('.playing-card__pcard-rows');
    if (!rentList) throw new Error('property card has no rent rows');
    while (rentList.querySelectorAll('.playing-card__pcard-row').length < 4) {
      const row = rentList.querySelector('.playing-card__pcard-row');
      if (!row) break;
      rentList.appendChild(row.cloneNode(true));
    }
    const city = propCard.querySelector('.playing-card__pcard-city-title');
    if (city) city.textContent = 'Bhubaneswar';

    // PlayingCard.tsx sets this from RENT_TABLE[card.color].length — padding
    // the DOM to 4 rows without also updating it would test a card whose
    // --card-ref-rows thinks it only has however many rows the real fixture
    // card started with, not the 4 actually being rendered.
    propCard.style.setProperty('--rent-rows', '4');
    propCard.style.setProperty('transform', 'none', 'important');
    const face = rentList as HTMLElement;

    return widths.map((w) => {
      propCard.style.setProperty('width', `${w}px`, 'important');
      void propCard.offsetHeight;
      return {
        w,
        cardW: propCard.offsetWidth,
        cardH: propCard.offsetHeight,
        faceScrollH: face.scrollHeight,
        faceClientH: face.clientHeight,
      };
    });
  }, WIDTHS);
}

/**
 * Builds a synthetic two-colour wildcard whose *both* halves carry a 4-row
 * rent table — two railroad-length sets stacked in one card, the worst case
 * a wildcard face can show — and sweeps it the same way.
 */
async function probeWorstCaseWild(page: Page): Promise<ProbeResult[]> {
  return page.evaluate((widths) => {
    const propCard = document.querySelector<HTMLElement>(
      '.hand-fan__card[data-card-kind="property"]',
    );
    if (!propCard) throw new Error('no property card in hand to clone from');
    const clone = propCard.cloneNode(false) as HTMLElement;
    clone.classList.add('playing-card--wild');
    clone.removeAttribute('data-card-id');
    clone.removeAttribute('data-testid');
    // cloneNode(false) copies the source property card's inline style
    // wholesale, including whatever --rent-rows PlayingCard.tsx gave it —
    // override with the real total (both 4-row halves) a wild card would set.
    clone.style.setProperty('--rent-rows', '8');
    clone.style.setProperty('transform', 'none', 'important');

    const makeHalf = (letter: 'a' | 'b') => {
      const half = document.createElement('div');
      half.className = `playing-card__wild-half playing-card__wild-half--${letter}`;
      half.innerHTML = `
        <span class="playing-card__city">Test City ${letter}</span>
        <span class="playing-card__rule" aria-hidden="true"></span>
        <ul class="playing-card__rent-list">
          ${Array.from(
            { length: 4 },
            () => '<li class="playing-card__rent-row"><span class="playing-card__rent-amount">1</span></li>',
          ).join('')}
        </ul>
        <span class="playing-card__fullset-caption">Full set</span>
      `;
      return half;
    };
    const face = document.createElement('div');
    face.className = 'playing-card__wild-face';
    face.appendChild(makeHalf('a'));
    face.appendChild(makeHalf('b'));
    clone.replaceChildren(face);
    propCard.after(clone);

    return widths.map((w) => {
      clone.style.setProperty('width', `${w}px`, 'important');
      void clone.offsetHeight;
      return {
        w,
        cardW: clone.offsetWidth,
        cardH: clone.offsetHeight,
        faceScrollH: face.scrollHeight,
        faceClientH: face.clientHeight,
      };
    });
  }, WIDTHS);
}

/**
 * Turns one real board card inside the opponent spotlight into the worst
 * realistic case (a 4-row rent table, long city name) and sweeps it across a
 * range of *heights* — unlike hand cards, `.opponent-spotlight .property-set-
 * view__card.playing-card--board` is height-driven (`height: clamp(...);
 * width: auto`, mirroring `.properties-panel`'s own override), so height is
 * the axis that actually varies across breakpoints (52-84px base clamp,
 * 40-52px in the landscape retune) — sweeping width the way the hand-card
 * probes do would exercise the same generic ratio machinery but never touch
 * this component's specific height-driven CSS path.
 */
async function probeWorstCaseSpotlightBoard(page: Page, heights: number[]): Promise<ProbeResult[]> {
  return page.evaluate((heights) => {
    const boardCard = document.querySelector<HTMLElement>(
      '.opponent-spotlight .property-set-view__card.playing-card--board',
    );
    if (!boardCard) throw new Error('no board card in the opponent spotlight to probe');
    // Board size collapses the India-design face to a compact price-chip +
    // city-name layout with the rent rows hidden entirely (illegible at
    // 46-120px tall regardless of scaling — see the board/sm tier rules in
    // styles.css), so there's no rows region left to pad or clip here. The
    // ratio/no-growth guarantee still comes from `contain: size` on
    // .playing-card itself, which this test's ratio check below covers;
    // there's just nothing left to overflow, so faceScrollH/faceClientH are
    // read off the whole card face for parity with the other probes.
    const city = boardCard.querySelector('.playing-card__pcard-city-title');
    if (city) city.textContent = 'Bhubaneswar';

    boardCard.style.setProperty('--rent-rows', '4');
    boardCard.style.setProperty('transform', 'none', 'important');
    const face = boardCard.querySelector<HTMLElement>('.playing-card__pcard');
    if (!face) throw new Error('spotlight board card has no face');

    return heights.map((h) => {
      boardCard.style.setProperty('height', `${h}px`, 'important');
      void boardCard.offsetHeight;
      return {
        w: h, // reported as the swept axis for expectCardRatio's error label
        cardW: boardCard.offsetWidth,
        cardH: boardCard.offsetHeight,
        faceScrollH: face.scrollHeight,
        faceClientH: face.clientHeight,
      };
    });
  }, heights);
}

/** Heights spanning the spotlight's real range: the landscape retune's floor
 *  (46px) up to the desktop enhancement's ceiling (120px, matching
 *  .properties-panel's own-board clamp) — the exact values
 *  `.opponent-spotlight .property-set-view__card.playing-card--board` can
 *  actually produce across every breakpoint, not arbitrary intermediate
 *  points. See styles.css. */
const SPOTLIGHT_BOARD_HEIGHTS = [46, 52, 60, 68, 76, 84, 92, 100, 110, 120];

test.describe('playing card sizing', () => {
  test.beforeEach(async ({ page }) => {
    // Compact/phone width: this is the only regime where a hand card's width
    // is small enough for a long rent table to threaten the ratio — see
    // COMPACT_HAND_QUERY in useIsCompactHand.ts.
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/local');
    await expect(page.getByTestId('hand-fan')).toBeVisible();
  });

  test('every card in hand keeps a 5:7 ratio with its real content', async ({ page }) => {
    const cards = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll<HTMLElement>('.hand-fan__card'));
      return els.map((el) => {
        el.style.setProperty('transform', 'none', 'important');
        void el.offsetHeight;
        return {
          kind: el.getAttribute('data-card-kind'),
          w: el.offsetWidth,
          h: el.offsetHeight,
        };
      });
    });
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      expectCardRatio(c.w, c.h, `hand card (${c.kind})`);
    }
  });

  test('a 2-row property is scaled less aggressively than a 4-row one at the same width', async ({
    page,
  }) => {
    // --card-scale-rows is keyed off the card's own --rent-rows (see
    // --card-ref-rows on .playing-card--property in styles.css), not one
    // flat worst-case reference — a short set's rent rows should stay
    // closer to full size than a long one at the same narrow width. This is
    // the legibility fix: without it, a 2-row card's rows were shrunk as if
    // they were the 4-row worst case for no reason, which is what made
    // ordinary rent text hard to read on a phone. (The header — badge/
    // tagline/price/city — is deliberately NOT part of this: the reference
    // design uses the same header size on every state regardless of row
    // count, so it stays on the flat --card-ref instead.)
    const scales = await page.evaluate(() => {
      const propCard = document.querySelector<HTMLElement>(
        '.hand-fan__card[data-card-kind="property"]',
      );
      if (!propCard) throw new Error('no property card in hand to probe');
      const miniCard = propCard.querySelector<HTMLElement>('.playing-card__pcard-mini-card');
      if (!miniCard) throw new Error('property card has no rent row mini-card icon');
      propCard.style.setProperty('transform', 'none', 'important');
      propCard.style.setProperty('width', '123px', 'important');

      // --card-scale-rows itself is an unresolved custom property (calc/min/
      // cqw tokens, not a used value) when read back via getComputedStyle —
      // read it indirectly through something that actually consumes it
      // instead: a rent row's mini-card icon width is `40px *
      // var(--card-scale-rows)`, resolved to a real px value, so dividing
      // it back out gives the scale.
      const readScale = () => {
        void propCard.offsetHeight;
        return Number.parseFloat(getComputedStyle(miniCard).width) / 40;
      };

      propCard.style.setProperty('--rent-rows', '2');
      const scale2 = readScale();
      propCard.style.setProperty('--rent-rows', '4');
      const scale4 = readScale();
      return { scale2, scale4 };
    });

    expect(scales.scale4).toBeLessThan(1);
    expect(scales.scale2).toBeGreaterThan(scales.scale4);
    // A 2-row card's rows should render meaningfully larger than a 4-row
    // card's at the same width — not just technically bigger by a rounding
    // error. --card-ref-rows makes this ratio (104*2-16)/(104*4-16) ≈ 2.08x
    // by construction; 1.5x is a conservative floor that still catches a
    // regression to one flat reference (which would make this ratio ~1).
    expect(scales.scale2 / scales.scale4).toBeGreaterThan(1.5);
  });

  test('a 4-row property (railroad-length set) stays 5:7 and never clips, at every hand width', async ({
    page,
  }) => {
    const results = await probeWorstCaseProperty(page);
    for (const r of results) {
      expectCardRatio(r.cardW, r.cardH, `property @ ${r.w}px`);
      expect(
        r.faceScrollH,
        `property @ ${r.w}px: face content (${r.faceScrollH}px) overflowed its box (${r.faceClientH}px) — content was clipped`,
      ).toBeLessThanOrEqual(r.faceClientH + 1);
    }
  });

  test('a two-colour wildcard with two 4-row halves stays 5:7 and never clips, at every hand width', async ({
    page,
  }) => {
    const results = await probeWorstCaseWild(page);
    for (const r of results) {
      expectCardRatio(r.cardW, r.cardH, `wildcard @ ${r.w}px`);
      expect(
        r.faceScrollH,
        `wildcard @ ${r.w}px: face content (${r.faceScrollH}px) overflowed its box (${r.faceClientH}px) — content was clipped`,
      ).toBeLessThanOrEqual(r.faceClientH + 1);
    }
  });
});

test.describe('opponent spotlight card sizing', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/local');
    await expect(page.getByTestId('hand-fan')).toBeVisible();

    // /local's own default deal is real-shuffled (Date.now()-seeded, see
    // localAdapter.ts's freshGame) — not safe to assume any player owns a
    // property. Load standardMidGame explicitly: p2 owns a real one-card
    // brown set, giving a real board card to mutate into the worst case, the
    // same way the hand-card probes above do. The dev controls live inside
    // the phone drawer, so open it before the scenario select is reachable.
    await page.getByRole('button', { name: 'Open table feed' }).click();
    await page.getByLabel('Dev scenario').selectOption('standardMidGame');
    await page.getByRole('button', { name: 'Collapse table feed' }).click();

    await page.getByTestId('end-turn-btn').click();
    await expect(page.getByTestId('opponent-spotlight')).toBeVisible();
  });

  test('a 4-row board card (railroad-length set) stays 5:7 and never clips, at every spotlight height', async ({
    page,
  }) => {
    const results = await probeWorstCaseSpotlightBoard(page, SPOTLIGHT_BOARD_HEIGHTS);
    for (const r of results) {
      expectCardRatio(r.cardW, r.cardH, `spotlight board card @ ${r.w}px tall`);
      expect(
        r.faceScrollH,
        `spotlight board card @ ${r.w}px tall: face content (${r.faceScrollH}px) overflowed its box (${r.faceClientH}px) — content was clipped`,
      ).toBeLessThanOrEqual(r.faceClientH + 1);
    }
  });
});

/**
 * Same idea as probeWorstCaseSpotlightBoard, but for the player's own board
 * inside .properties-panel. Unlike the opponent spotlight, this board card
 * un-collapses back to the full India-design face (band/price/city/rows)
 * once sized past the ~100px legibility floor — see the `.properties-panel`
 * board-card overrides in styles.css — so unlike the spotlight probe there
 * really is a rows region here that can clip, the same as the hand-card
 * probe checks.
 */
async function probeWorstCaseOwnBoard(page: Page, heights: number[]): Promise<ProbeResult[]> {
  return page.evaluate((heights) => {
    const boardCard = document.querySelector<HTMLElement>(
      '.properties-panel .property-set-view__card.playing-card--board',
    );
    if (!boardCard) throw new Error('no board card in the properties panel to probe');
    const rentList = boardCard.querySelector('.playing-card__pcard-rows');
    if (!rentList) throw new Error('own-board property card has no rent rows');
    while (rentList.querySelectorAll('.playing-card__pcard-row').length < 4) {
      const row = rentList.querySelector('.playing-card__pcard-row');
      if (!row) break;
      rentList.appendChild(row.cloneNode(true));
    }
    const city = boardCard.querySelector('.playing-card__pcard-city-title');
    if (city) city.textContent = 'Bhubaneswar';

    boardCard.style.setProperty('--rent-rows', '4');
    boardCard.style.setProperty('transform', 'none', 'important');
    const face = rentList as HTMLElement;

    return heights.map((h) => {
      boardCard.style.setProperty('height', `${h}px`, 'important');
      void boardCard.offsetHeight;
      return {
        w: h, // reported as the swept axis for expectCardRatio's error label
        cardW: boardCard.offsetWidth,
        cardH: boardCard.offsetHeight,
        faceScrollH: face.scrollHeight,
        faceClientH: face.clientHeight,
      };
    });
  }, heights);
}

/** Heights spanning the properties panel's own-board range once past the
 *  collapse floor: the phone-portrait clamp (100-150px) up through the
 *  desktop clamp's ceiling (190px) — see `.properties-panel`'s board-card
 *  height clamps in styles.css. */
const OWN_BOARD_HEIGHTS = [96, 100, 110, 120, 130, 140, 150, 165, 180, 190];

test.describe('properties panel own-board card sizing', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/local');
    await expect(page.getByTestId('hand-fan')).toBeVisible();

    // Same reasoning as the opponent-spotlight suite above: /local's default
    // deal is real-shuffled, not safe to assume the local seat owns a
    // property. standardMidGame gives the local player real board sets too.
    await page.getByRole('button', { name: 'Open table feed' }).click();
    await page.getByLabel('Dev scenario').selectOption('standardMidGame');
    await page.getByRole('button', { name: 'Collapse table feed' }).click();

    await expect(
      page.locator('.properties-panel .property-set-view__card.playing-card--board').first(),
    ).toBeVisible();
  });

  test('a 4-row property (railroad-length set) on the own board stays 5:7 and never clips, at every board-card height', async ({
    page,
  }) => {
    const results = await probeWorstCaseOwnBoard(page, OWN_BOARD_HEIGHTS);
    for (const r of results) {
      expectCardRatio(r.cardW, r.cardH, `own-board property @ ${r.w}px tall`);
      expect(
        r.faceScrollH,
        `own-board property @ ${r.w}px tall: face content (${r.faceScrollH}px) overflowed its box (${r.faceClientH}px) — content was clipped`,
      ).toBeLessThanOrEqual(r.faceClientH + 1);
    }
  });
});
