import { test, expect } from './fixtures/auth.fixture';

test.describe('Project Operations', () => {
  test('should display sidebar with project', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });

  test('should show project selector', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Wait for sidebar to load fully
    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Project selector should be visible (seed creates a project)
    const projectSelector = page.locator('[data-testid="project-selector-trigger"]');
    await expect(projectSelector).toBeVisible({ timeout: 15000 });
  });

  test('should open new project dialog', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Open project dropdown
    const projectSelector = page.locator('[data-testid="project-selector-trigger"]');
    await expect(projectSelector).toBeVisible({ timeout: 15000 });
    await projectSelector.click();

    // Click "New Project" in dropdown
    const newProjectBtn = page.locator('[data-testid="new-project-dropdown-btn"]');
    await expect(newProjectBtn).toBeVisible({ timeout: 5000 });
    await newProjectBtn.click();

    // Dialog should appear
    const dialog = page.locator('[data-testid="new-project-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Should have name input
    const nameInput = page.locator('[data-testid="new-project-name-input"]');
    await expect(nameInput).toBeVisible();
  });

  test('should create a new project', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Open project dropdown
    const projectSelector = page.locator('[data-testid="project-selector-trigger"]');
    await expect(projectSelector).toBeVisible({ timeout: 15000 });
    await projectSelector.click();

    // Click "New Project"
    const newProjectBtn = page.locator('[data-testid="new-project-dropdown-btn"]');
    await expect(newProjectBtn).toBeVisible({ timeout: 5000 });
    await newProjectBtn.click();

    const dialog = page.locator('[data-testid="new-project-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const nameInput = page.locator('[data-testid="new-project-name-input"]');
    await nameInput.fill('E2E New Project');

    const createBtn = page.locator('[data-testid="new-project-create-btn"]');
    await createBtn.click();

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe('Navigation', () => {
  test('sidebar should be visible on desktop', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.setViewportSize({ width: 1280, height: 720 });

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });

  test('should have responsive layout', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Desktop — sidebar visible
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(300);
    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    // Mobile — sidebar may collapse
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    // Just verify the page doesn't crash
    await expect(page.locator('body')).toBeVisible();
  });
});
