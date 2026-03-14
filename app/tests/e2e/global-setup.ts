/**
 * Global setup: seed test data, authenticate, save session state.
 *
 * Runs once before all tests. Creates a test user via /test/seed,
 * logs in through the UI, and saves browser state for test reuse.
 */
import { chromium, FullConfig } from '@playwright/test';
import { seedTestData, cleanupTestData, setGlobalTestData } from './helpers/seed';
import { getTestUrls } from './helpers/config';

export default async function globalSetup(_config: FullConfig) {
  const { apiUrl, appUrl } = getTestUrls();
  console.log(`E2E setup: API=${apiUrl}, App=${appUrl}`);

  // Clean slate
  await cleanupTestData();
  const testData = await seedTestData();
  setGlobalTestData(testData);

  // Authenticate via browser to capture session cookies
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${appUrl}/login`);

  // Identifier-first login: submit email, then password appears
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });
  await emailInput.fill(testData.email);
  await page.locator('button[type="submit"]').click();

  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.waitFor({ state: 'visible', timeout: 15000 });
  await passwordInput.fill(testData.password);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  console.log(`✅ Authenticated, redirected to: ${page.url()}`);

  await page.context().storageState({ path: 'playwright/.auth/user.json' });
  await browser.close();
}
