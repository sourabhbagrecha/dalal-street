/**
 * Phase 4 skeleton — full multi-client specs land in subsequent commits.
 * This file must compile under Playwright + TypeScript.
 */
import { test, expect } from '@playwright/test';

test.describe('e2e-net skeleton', () => {
  test('lobby page renders create controls', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('display-name-input')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('create-room-btn')).toBeVisible();
    await expect(page.getByRole('link', { name: /pass/i })).toBeVisible();
  });
});
