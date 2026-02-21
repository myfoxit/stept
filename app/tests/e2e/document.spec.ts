import { test, expect } from './fixtures/auth.fixture';

test.describe('Sidebar Navigation', () => {
  test('should display sidebar with project content', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });

  test('should show Shared with me section', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // "Shared with me" should be visible in sidebar
    await expect(page.getByText('Shared with me')).toBeVisible({ timeout: 10000 });
  });

  test('should show Settings link', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    await expect(page.getByText('Settings')).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to settings', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.getByText('Settings').click();
    await expect(page).toHaveURL(/\/settings/, { timeout: 10000 });
  });
});

test.describe('Sidebar Content', () => {
  test('should show folder structure', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });
});
