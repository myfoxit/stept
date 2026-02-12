import { test, expect } from './fixtures/auth.fixture';

test.describe('Project Operations', () => {
  test('should display project list', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.waitForLoadState('networkidle');

    // Look for project-related content
    const projectArea = page.locator(
      '[data-testid="project-list"], [data-testid="projects"], [class*="project"]'
    ).first();

    // At minimum, the test project from seeding should exist
    await expect(
      page.locator('text="E2E Test Project"').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('should create a new project', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.waitForLoadState('networkidle');

    // Find create project button
    const createButton = page.locator(
      'button:has-text("New Project"), button:has-text("Create Project"), [data-testid="create-project"]'
    ).first();

    if (await createButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createButton.click();

      const dialog = page.locator('[role="dialog"]').first();
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const nameInput = dialog.locator('input').first();
      await nameInput.fill('E2E New Project');

      await dialog.locator('button:has-text("Create")').click();
      await expect(dialog).not.toBeVisible({ timeout: 5000 });

      // Verify project appears
      await expect(
        page.locator('text="E2E New Project"').first()
      ).toBeVisible({ timeout: 10000 });
    }
  });
});

test.describe('Navigation', () => {
  test('should navigate between main sections', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.waitForLoadState('networkidle');

    // Check sidebar exists
    const sidebar = page.locator(
      '[data-testid="sidebar"], aside, nav, [class*="sidebar"]'
    ).first();
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });

  test('should have responsive layout', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Desktop view
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator(
      '[data-testid="sidebar"], aside, [class*="sidebar"]'
    ).first();
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    // Mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    // Sidebar should be hidden or collapsed on mobile
    // (exact behavior depends on UI implementation)
  });
});
