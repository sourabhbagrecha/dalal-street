import type { Page } from '@playwright/test';

/** Programmatic HTML5 drag-and-drop for overlapping hand-fan cards. */
export async function dragCardToZone(
  page: Page,
  cardTestId: string,
  dropTestId: string,
): Promise<void> {
  // Board updates are server round-trips (no client prediction), so either end
  // may still be mounting — wait for both rather than failing on a race.
  await page.getByTestId(cardTestId).first().waitFor({ state: 'attached' });
  await page.getByTestId(dropTestId).first().waitFor({ state: 'attached' });
  await page.evaluate(
    ({ cardId, dropId }) => {
      const card = document.querySelector(`[data-testid="${cardId}"]`);
      const drop = document.querySelector(`[data-testid="${dropId}"]`);
      if (!card || !drop) throw new Error(`DnD elements missing: ${cardId} -> ${dropId}`);

      const dataTransfer = new DataTransfer();
      const cardKey = card.getAttribute('data-card-id') ?? '';
      dataTransfer.setData('application/x-monopoly-card', cardKey);

      card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
      drop.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
      drop.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
      card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
    },
    { cardId: cardTestId, dropId: dropTestId },
  );
}

/** Click a hand card that may be covered by the fan layout. */
export async function clickHandCard(page: Page, cardTestId: string): Promise<void> {
  await page.getByTestId(cardTestId).first().waitFor({ state: 'attached' });
  await page.evaluate((testId) => {
    const card = document.querySelector(`[data-testid="${testId}"]`);
    card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, cardTestId);
}
