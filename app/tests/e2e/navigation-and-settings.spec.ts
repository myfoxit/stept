import { test, expect } from './fixtures/auth.fixture';

test.describe('Navigation + Settings smoke', () => {
  test('opens settings from sidebar and returns to home', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible({ timeout: 10000 });
    await page.getByText('Settings').click();
    await expect(page).toHaveURL(/\/settings/, { timeout: 10000 });

    await page.goto('/');
    await expect(page).not.toHaveURL(/\/settings/, { timeout: 10000 });
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible({ timeout: 10000 });
  });

  test('project selector dropdown opens and closes via Escape', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const trigger = page.locator('[data-testid="project-selector-trigger"]');
    await expect(trigger).toBeVisible({ timeout: 15000 });
    await trigger.click();

    const createBtn = page.locator('[data-testid="new-project-dropdown-btn"]');
    await expect(createBtn).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');
    await expect(createBtn).not.toBeVisible({ timeout: 5000 });
  });

  test('new project dialog can be cancelled', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.locator('[data-testid="project-selector-trigger"]').click();
    await page.locator('[data-testid="new-project-dropdown-btn"]').click();

    const dialog = page.locator('[data-testid="new-project-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const cancelButton = dialog.locator('button:has-text("Cancel")').first();
    await cancelButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('user menu opens and contains log out action', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const userMenu = page.locator('[data-testid="user-menu-trigger"]');
    await expect(userMenu).toBeVisible({ timeout: 10000 });
    await userMenu.click();

    await expect(page.locator('text="Log out"')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
  });

  test('sidebar remains visible after viewport changes', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible({ timeout: 5000 });

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator('body')).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible({ timeout: 5000 });
  });

  test('shared with me section is visible on home', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/');

    await expect(page.getByText('Shared with me')).toBeVisible({ timeout: 10000 });
  });

  test('new folder dialog can open and close without creating', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const newFolderBtn = page.locator('button[title="New Folder"]').first();
    await expect(newFolderBtn).toBeVisible({ timeout: 10000 });
    await newFolderBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });
});
