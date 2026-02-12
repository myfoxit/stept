import { test, expect } from './fixtures/auth.fixture';

test.describe('Authentication', () => {
  test('should show login page for unauthenticated users', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should login with valid credentials', async ({ page, testData }) => {
    await page.context().clearCookies();
    await page.goto('/login');

    await page.fill('input[type="email"]', testData.email);
    await page.fill('input[type="password"]', testData.password);
    await page.click('button[type="submit"]');

    // Should redirect away from login
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('should reject invalid credentials', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');

    await page.fill('input[type="email"]', 'wrong@test.com');
    await page.fill('input[type="password"]', 'WrongPassword!');
    await page.click('button[type="submit"]');

    // Should stay on login page (login silently fails — no error toast)
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/login/);
  });

  test('should show user menu when authenticated', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // The user menu trigger has data-testid="user-menu-trigger"
    const userMenu = page.locator('[data-testid="user-menu-trigger"]');
    await expect(userMenu).toBeVisible({ timeout: 10000 });
  });

  test('should logout successfully', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Click user menu trigger
    const userMenu = page.locator('[data-testid="user-menu-trigger"]');
    await expect(userMenu).toBeVisible({ timeout: 10000 });
    await userMenu.click();

    // Click "Log out" in the dropdown
    const logoutButton = page.locator('text="Log out"');
    await expect(logoutButton).toBeVisible({ timeout: 5000 });
    await logoutButton.click();

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});
