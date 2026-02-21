import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Run tests sequentially for database consistency
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for test database consistency
  reporter: [['html'], ['line']],
  timeout: 30000, // 30 seconds per test
  
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    // Reuse authenticated state produced by global-setup
    storageState: 'playwright/.auth/user.json',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: process.env.PLAYWRIGHT_NO_SERVER ? undefined : {
    command: 'pnpm dev --port 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      ...process.env,
      VITE_API_URL: process.env.VITE_API_URL || process.env.API_URL || 'http://localhost:8000',
      VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || (process.env.API_URL ? `${process.env.API_URL}/api/v1` : 'http://localhost:8000/api/v1'),
      ENVIRONMENT: 'test',
    },
  },

  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
});
