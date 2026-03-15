import { test as base, expect, Page } from '@playwright/test';
import { getGlobalTestData, TestData } from '../helpers/seed';
import { getTestUrls } from '../helpers/config';

type AuthFixtures = {
  authenticatedPage: Page;
  testData: TestData;
};

export const test = base.extend<AuthFixtures>({
  testData: async ({}, use) => {
    const data = getGlobalTestData();
    if (!data) {
      throw new Error(
        'Test seed data not found. Did global-setup run? Check playwright/.auth/seed-data.json',
      );
    }
    await use(data);
  },

  authenticatedPage: async ({ browser }, use) => {
    const data = getGlobalTestData();
    if (!data) {
      throw new Error('Test seed data not found.');
    }

    const { appUrl } = getTestUrls();

    // Create a fresh browser context — do NOT rely on storageState
    // because the logout test invalidates the session server-side.
    const context = await browser.newContext();
    const page = await context.newPage();

    // Login via UI
    await page.goto(`${appUrl}/login`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Identifier-first login: step 1 — email, step 2 — password
    const emailInput = page.locator('input[type="email"]');
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill(data.email);
    await page.locator('button[type="submit"]').click();

    // Wait for password step to appear
    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    await passwordInput.fill(data.password);
    await page.locator('button[type="submit"]').click();

    // Wait for redirect away from login
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 15000,
    });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    await use(page);

    await context.close();
  },
});

export { expect } from '@playwright/test';
