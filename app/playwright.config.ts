import { defineConfig, devices } from '@playwright/test';

/**
 * E2E test configuration for ondoki-web.
 *
 * Tests run against a dedicated test backend (port 8001, ondoki_test DB)
 * and a Playwright-managed Vite dev server (port 5174).
 *
 * Run with: make test-e2e
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['line']],
  timeout: 30_000,

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    storageState: 'playwright/.auth/user.json',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Playwright starts its own Vite dev server on :5174.
   * VITE_API_URL/VITE_API_BASE_URL point to the test backend on :8001.
   * Set PLAYWRIGHT_NO_SERVER=1 to skip (e.g. if running against a deployed env). */
  webServer: process.env.PLAYWRIGHT_NO_SERVER
    ? undefined
    : {
        command: 'pnpm dev --port 5174',
        url: 'http://localhost:5174',
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          ...process.env,
          VITE_API_URL: process.env.API_URL || 'http://localhost:8001',
          VITE_API_BASE_URL: process.env.API_URL
            ? `${process.env.API_URL}/api/v1`
            : 'http://localhost:8001/api/v1',
        },
      },

  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
});
