import { test as base, expect, Page } from '@playwright/test';
import { getGlobalTestData, TestData } from '../helpers/seed';

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

  authenticatedPage: async ({ page }, use) => {
    // storageState from playwright config provides auth cookies
    await page.goto('/');
    // Wait for the app to load past any redirects
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await use(page);
  },
});

export { expect } from '@playwright/test';
