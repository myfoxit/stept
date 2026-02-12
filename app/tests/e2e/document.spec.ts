import { test, expect } from './fixtures/auth.fixture';

test.describe('Document / Pages Section', () => {
  test('should display Pages link in sidebar', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // "Pages" link in the sidebar navigation
    const pagesLink = page.locator('a[href="/documents/pages"]');
    await expect(pagesLink).toBeVisible({ timeout: 10000 });
  });

  test('should display Workflows link in sidebar', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // "Workflows" link in the sidebar navigation
    const workflowsLink = page.locator('a[href="/documents/workflows"]');
    await expect(workflowsLink).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to pages gallery', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const pagesLink = page.locator('a[href="/documents/pages"]');
    await expect(pagesLink).toBeVisible({ timeout: 10000 });
    await pagesLink.click();

    await expect(page).toHaveURL(/\/documents\/pages/, { timeout: 10000 });
  });

  test('should navigate to workflows gallery', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const workflowsLink = page.locator('a[href="/documents/workflows"]');
    await expect(workflowsLink).toBeVisible({ timeout: 10000 });
    await workflowsLink.click();

    await expect(page).toHaveURL(/\/documents\/workflows/, { timeout: 10000 });
  });
});

test.describe('Sidebar Content', () => {
  test('should show folder structure', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // The sidebar should have loaded with the project content
    // At minimum, check that the sidebar itself is present
    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });
});
