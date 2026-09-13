import { defineConfig } from '@playwright/test';

// Design checks deliberately use the user's already-running dev server.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'scratchpad-designs.spec.ts',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5173', viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }, { name: 'webkit', use: { browserName: 'webkit' } }],
});
