import { test, expect } from './fixtures/auth.fixture';

test.describe('Project Operations', () => {
  test('should display sidebar with project', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Sidebar should be visible
    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });

  test('should show project selector', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Project selector trigger should exist
    const projectSelector = page.locator('[data-testid="project-selector-trigger"]');
    // Either project selector OR create-first-project button should be visible
    const createFirstProject = page.locator('[data-testid="create-first-project-btn"]');

    const hasSelector = await projectSelector.isVisible({ timeout: 5000 }).catch(() => false);
    const hasCreate = await createFirstProject.isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasSelector || hasCreate).toBe(true);
  });

  test('should open new project dialog', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // First check if we already have a project selector (project exists from seed)
    const projectSelector = page.locator('[data-testid="project-selector-trigger"]');
    if (await projectSelector.isVisible({ timeout: 5000 }).catch(() => false)) {
      await projectSelector.click();

      // Click "New Project" in dropdown
      const newProjectBtn = page.locator('[data-testid="new-project-dropdown-btn"]');
      await expect(newProjectBtn).toBeVisible({ timeout: 5000 });
      await newProjectBtn.click();
    } else {
      // No projects yet — click "Create first project"
      const createBtn = page.locator('[data-testid="create-first-project-btn"]');
      await createBtn.click();
    }

    // Dialog should appear
    const dialog = page.locator('[data-testid="new-project-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Should have name input
    const nameInput = page.locator('[data-testid="new-project-name-input"]');
    await expect(nameInput).toBeVisible();
  });

  test('should create a new project', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const projectSelector = page.locator('[data-testid="project-selector-trigger"]');
    if (await projectSelector.isVisible({ timeout: 5000 }).catch(() => false)) {
      await projectSelector.click();
      const newProjectBtn = page.locator('[data-testid="new-project-dropdown-btn"]');
      await expect(newProjectBtn).toBeVisible({ timeout: 5000 });
      await newProjectBtn.click();
    } else {
      const createBtn = page.locator('[data-testid="create-first-project-btn"]');
      await createBtn.click();
    }

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
