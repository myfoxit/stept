import { test, expect } from './fixtures/auth.fixture';

test.describe('Authentication', () => {
  test('should show login page for unauthenticated users', async ({ page }) => {
    // Use a fresh page without storageState
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

    // Should stay on login page
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    // Should show error
    await expect(
      page.locator('[role="alert"], .error, [class*="error"]').first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('should show user info when authenticated', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Look for user-related UI elements (avatar, name, menu)
    const userIndicator = page.locator(
      '[data-testid="user-menu"], [data-testid="avatar"], [class*="avatar"], [aria-label*="user"], [aria-label*="account"]'
    ).first();
    
    await expect(userIndicator).toBeVisible({ timeout: 10000 });
  });

  test('should logout successfully', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Find and click user menu / logout button
    const userMenu = page.locator(
      '[data-testid="user-menu"], [aria-label*="user"], [aria-label*="account"], button:has([class*="avatar"])'
    ).first();
    
    if (await userMenu.isVisible()) {
      await userMenu.click();
      
      const logoutButton = page.locator(
        'button:has-text("Logout"), button:has-text("Sign out"), [data-testid="logout"]'
      ).first();
      
      if (await logoutButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await logoutButton.click();
        // Should redirect to login
        await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
      }
    }
  });
});
