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
    const rentList = propCard.querySelector('.playing-card__rent-list');
    if (!rentList) throw new Error('property card has no rent list');
    while (rentList.querySelectorAll('.playing-card__rent-row').length < 4) {
      const row = rentList.querySelector('.playing-card__rent-row');
      if (!row) break;
      rentList.appendChild(row.cloneNode(true));
    }
    const city = propCard.querySelector('.playing-card__city');
    if (city) city.textContent = 'Bhubaneswar';

    // PlayingCard.tsx sets this from RENT_TABLE[card.color].length — padding
    // the DOM to 4 rows without also updating it would test a card whose
    // --card-ref thinks it only has however many rows the real fixture card
    // started with, not the 4 actually being rendered.
    propCard.style.setProperty('--rent-rows', '4');
    propCard.style.setProperty('transform', 'none', 'important');
    const face = propCard.querySelector<HTMLElement>('.playing-card__property-face');
    if (!face) throw new Error('property card has no face');

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
    // --card-scale is keyed off the card's own --rent-rows (see --card-ref on
    // .playing-card--property in styles.css), not one flat worst-case
    // reference — a short set should stay closer to full size than a long
    // one at the same narrow width. This is the legibility fix: without it,
    // a 2-row card was shrunk as if it were the 4-row worst case for no
    // reason, which is what made ordinary rent text hard to read on a phone.
    const scales = await page.evaluate(() => {
      const propCard = document.querySelector<HTMLElement>(
        '.hand-fan__card[data-card-kind="property"]',
      );
      if (!propCard) throw new Error('no property card in hand to probe');
      const row = propCard.querySelector<HTMLElement>('.playing-card__rent-row');
      if (!row) throw new Error('property card has no rent row');
      propCard.style.setProperty('transform', 'none', 'important');
      propCard.style.setProperty('width', '123px', 'important');

      // --card-scale itself is an unresolved custom property (calc/min/cqw
      // tokens, not a used value) when read back via getComputedStyle — read
      // it indirectly through something that actually consumes it instead:
      // a rent row's height is `28px * var(--card-scale)`, resolved to a
      // real px value, so dividing it back out gives the scale.
      const readScale = () => {
        void propCard.offsetHeight;
        return Number.parseFloat(getComputedStyle(row).height) / 28;
      };

      propCard.style.setProperty('--rent-rows', '2');
      const scale2 = readScale();
      propCard.style.setProperty('--rent-rows', '4');
      const scale4 = readScale();
      return { scale2, scale4 };
    });

    expect(scales.scale4).toBeLessThan(1);
    expect(scales.scale2).toBeGreaterThan(scales.scale4);
    // A 2-row card at a typical compact-hand width shouldn't be shrunk much
    // at all — the flat worst-case reference used to shrink it to ~0.77.
    expect(scales.scale2).toBeGreaterThan(0.9);
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
