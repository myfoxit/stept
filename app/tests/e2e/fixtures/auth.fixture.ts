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
    await page.waitForLoadState('domcontentloaded');

    await page.fill('input[type="email"]', data.email);
    await page.fill('input[type="password"]', data.password);
    await page.click('button[type="submit"]');

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
