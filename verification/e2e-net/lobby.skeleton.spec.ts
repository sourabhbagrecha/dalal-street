/**
 * Phase 4 skeleton — full multi-client specs land in subsequent commits.
 * This file must compile under Playwright + TypeScript.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';

export async function createLobby(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.getByTestId('display-name-input').fill(name);
  await page.getByTestId('create-room-btn').click();
  const code = page.getByTestId('room-code');
  await expect(code).toBeVisible({ timeout: 15_000 });
  return (await code.innerText()).trim();
}

test.describe('e2e-net skeleton', () => {
  test('lobby page renders create controls', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('display-name-input')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('create-room-btn')).toBeVisible();
    await expect(page.getByRole('link', { name: /pass/i })).toBeVisible();
  });
});

export type { BrowserContext, Page };
