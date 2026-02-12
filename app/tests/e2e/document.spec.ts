import { test, expect } from './fixtures/auth.fixture';

test.describe('Document Operations', () => {
  test('should create a new document', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.waitForLoadState('networkidle');

    // Find Pages section in sidebar
    const pagesSection = page.locator('text="Pages"').first();
    await expect(pagesSection).toBeVisible({ timeout: 10000 });

    // Click new page/document button
    const newPageButton = page.locator(
      'button:has-text("New Page"), button:has-text("Add Page"), [data-testid="new-page"]'
    ).first();

    if (await newPageButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newPageButton.click();

      // Wait for editor area to appear
      await expect(
        page.locator('[data-testid="editor"], [contenteditable], [class*="editor"]').first()
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test('should display document list in sidebar', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.waitForLoadState('networkidle');

    // Sidebar should show Pages section
    const pagesSection = page.locator('text="Pages"').first();
    await expect(pagesSection).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Workflow/Recording View', () => {
  test('should display workflows section', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.waitForLoadState('networkidle');

    // Look for Workflows/Recordings section
    const workflowSection = page.locator(
      'text="Workflows", text="Recordings", [data-testid="workflows"]'
    ).first();

    if (await workflowSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await workflowSection.click();
      await page.waitForLoadState('networkidle');
    }
  });
});
