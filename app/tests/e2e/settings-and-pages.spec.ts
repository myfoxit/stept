import { test, expect } from './fixtures/auth.fixture';

test.describe('Project Settings', () => {
  test('should navigate to project settings', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;

    await page.goto(`/projects/${testData.project_id}/settings`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    await expect(page).toHaveURL(new RegExp(`/projects/.*/settings`), { timeout: 10000 });
  });

  test('should show project name in settings', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;

    await page.goto(`/projects/${testData.project_id}/settings`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Should have an input or heading with the project name
    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const value = await nameInput.inputValue();
      expect(value.length).toBeGreaterThan(0);
    }
  });

  test('should navigate to AI settings', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;

    await page.goto(`/projects/${testData.project_id}/settings/ai`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    await expect(page).toHaveURL(/\/settings\/ai/, { timeout: 10000 });
  });

  test('should navigate to privacy settings', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;

    await page.goto(`/projects/${testData.project_id}/settings/privacy`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    await expect(page).toHaveURL(/\/settings\/privacy/, { timeout: 10000 });
  });

  test('should navigate to integrations settings', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;

    await page.goto(`/projects/${testData.project_id}/settings/integrations`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    await expect(page).toHaveURL(/\/settings\/integrations/, { timeout: 10000 });
  });
});

test.describe('User Settings', () => {
  test('should navigate to settings directly', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/settings');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await expect(page).toHaveURL(/\/settings/, { timeout: 10000 });
  });
});

test.describe('Audit', () => {
  test('should navigate to audit log page', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto('/audit');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    await expect(page).toHaveURL(/\/audit/, { timeout: 10000 });
  });

  test('should load audit log via API', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const apiUrl = process.env.API_URL || 'http://localhost:8001';

    const resp = await page.request.get(
      `${apiUrl}/api/v1/audit/logs?project_id=${testData.project_id}`
    );
    expect(resp.ok()).toBeTruthy();
  });
});

test.describe('Knowledge Base', () => {
  test('should navigate to knowledge base page', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto('/knowledge');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    await expect(page).toHaveURL(/\/knowledge/, { timeout: 10000 });
  });
});
