import { test as base, expect, Page } from '@playwright/test';
import { getGlobalTestData, TestData } from '../helpers/seed';

type AuthFixtures = {
  authenticatedPage: Page;
  testData: TestData;
};

export const test = base.extend<AuthFixtures>({
  testData: async ({}, use) => {
    // Reuse globally seeded test data (no per-test seed/cleanup)
    const data = getGlobalTestData();
    await use(data);
  },

  authenticatedPage: async ({ page }, use) => {
    // Page is already authenticated via storageState; just go to the app
    await page.goto('/');
    await use(page);
  },
});

export { expect } from '@playwright/test';
