import type { Page } from '@playwright/test';

/**
 * Drives the felt table's one pointer gesture (table/useCardDrag.tsx): press a
 * hand card, pull it past the 8px threshold, let go over a drop target. The
 * hook follows the gesture on `window` and resolves the drop by
 * `document.elementsFromPoint` -> the nearest `[data-zone]`, so the release
 * has to land on a real on-screen point of the target, not on the element in
 * the abstract. Synthetic PointerEvents (one shared pointerId, `touch`) are
 * dispatched directly, because the fanned hand overlaps and a real click at a
 * card's centre could press its neighbour instead.
 *
 * Lifting a card swings the camera onto the viewer's seat (0.5s transition),
 * which moves every drop target on screen; the release waits for the target's
 * box to settle before it aims. The target is looked up by selector each time
 * it is measured — a React re-render in between can replace the node.
 */

/** Everything the browser-side gesture needs, kept as data so it can be `page.evaluate`d. */
interface GestureArgs {
  cardSelector: string;
  dropSelector: string | null;
}

const POINTER_ID = 7;

async function gesture(page: Page, args: GestureArgs): Promise<void> {
  await page.evaluate(async ({ cardSelector, dropSelector, pointerId }) => {
    const card = document.querySelector<HTMLElement>(cardSelector);
    if (!card) throw new Error(`DnD: hand card missing: ${cardSelector}`);
    const findDrop = () => (dropSelector ? document.querySelector<HTMLElement>(dropSelector) : null);
    if (dropSelector && !findDrop()) throw new Error(`DnD: drop target missing: ${dropSelector}`);

    const at = (type: string, x: number, y: number, target: EventTarget) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId,
          pointerType: 'touch',
          isPrimary: true,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: x,
          clientY: y,
        }),
      );
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    const boxOf = (el: HTMLElement | null) => {
      const r = el?.getBoundingClientRect();
      return r && r.width > 0 && r.height > 0 ? r : null;
    };

    // The table frame clips rather than scrolls, so a player always sees it at
    // scrollTop 0. A Playwright click on a sheet button that is still sliding in
    // can scroll the frame to reach it; put it back, or every target is off by that much.
    document.querySelector('.tb')?.scrollTo(0, 0);

    const start = card.getBoundingClientRect();
    const sx = start.left + start.width / 2;
    const sy = start.top + start.height / 2;
    at('pointerdown', sx, sy, card);

    if (!dropSelector) {
      // A tap: down and up in the same place.
      at('pointerup', sx, sy, window);
      return;
    }

    // Lift: past the threshold, straight up out of the tray.
    at('pointermove', sx, sy - 40, window);

    // The camera reframes on a lift; wait for the target to have a box and stop moving (cap ~2s).
    let last = '';
    let still = 0;
    for (let i = 0; i < 120 && still < 3; i++) {
      await frame();
      const r = boxOf(findDrop());
      const key = r ? [r.left, r.top, r.width, r.height].map((v) => Math.round(v)).join(',') : '';
      still = key !== '' && key === last ? still + 1 : 0;
      last = key;
    }

    const drop = findDrop();
    const r = boxOf(drop);
    if (!drop || !r) {
      throw new Error(
        `DnD: drop target ${dropSelector} has no box on screen (connected: ${drop?.isConnected ?? false}; viewport ${window.innerWidth}x${window.innerHeight})`,
      );
    }

    // Aim at a point where the pointer really lands on the target: the drop zone the hook would resolve there must be
    // the target itself, inside it (the own panel's sets) or wrapping it (a zone the target sits in).
    const zoneAt = (x: number, y: number): HTMLElement | null => {
      const [top] = document.elementsFromPoint(x, y);
      return top ? (top as HTMLElement).closest<HTMLElement>('[data-zone]') : null;
    };
    const ok = (x: number, y: number) => {
      const z = zoneAt(x, y);
      return !!z && (z === drop || drop.contains(z) || z.contains(drop));
    };
    const candidates: [number, number][] = [[r.left + r.width / 2, r.top + r.height / 2]];
    for (const fy of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      for (const fx of [0.5, 0.3, 0.7, 0.15, 0.85]) candidates.push([r.left + r.width * fx, r.top + r.height * fy]);
    }
    const hit = candidates.find(([x, y]) => ok(x, y));
    if (!hit) {
      throw new Error(
        `DnD: no point of ${dropSelector} is under the pointer on screen (box ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}; viewport ${window.innerWidth}x${window.innerHeight})`,
      );
    }
    const [x, y] = hit;
    at('pointermove', x, y, window);
    await frame();
    at('pointerup', x, y, window);
  }, { ...args, pointerId: POINTER_ID });
}

/** Drag a hand card (by test id) onto a drop target (by test id): bank-drop, discard-drop, properties-drop. */
export async function dragCardToZone(page: Page, cardTestId: string, dropTestId: string): Promise<void> {
  await dragCardToSelector(page, cardTestId, `[data-testid="${dropTestId}"]`);
}

/** Drag a hand card (by test id) onto any element (CSS selector), e.g. one specific set tile on the viewer's seat. */
export async function dragCardToSelector(page: Page, cardTestId: string, dropSelector: string): Promise<void> {
  // Board updates are server round-trips (no client prediction), so either end
  // may still be mounting — wait for both rather than failing on a race.
  await page.getByTestId(cardTestId).first().waitFor({ state: 'attached' });
  await page.locator(dropSelector).first().waitFor({ state: 'attached' });
  await gesture(page, { cardSelector: `[data-testid="${cardTestId}"]`, dropSelector });
}

/** Tap a hand card that may be covered by the fan layout (a press with no movement: the hook's `onTap`). */
export async function clickHandCard(page: Page, cardTestId: string): Promise<void> {
  await page.getByTestId(cardTestId).first().waitFor({ state: 'attached' });
  await gesture(page, { cardSelector: `[data-testid="${cardTestId}"]`, dropSelector: null });
}
