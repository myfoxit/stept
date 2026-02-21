export interface TestUrls {
  apiUrl: string;
  appUrl: string;
}

/**
 * Resolve test URLs from environment variables.
 *
 * E2E tests run against a dedicated test backend (default :8001)
 * and a Playwright-managed frontend (default :5174).
 * These are set by `make test-e2e`.
 */
export function getTestUrls(): TestUrls {
  return {
    apiUrl: process.env.API_URL || 'http://localhost:8001',
    appUrl: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5174',
  };
}
