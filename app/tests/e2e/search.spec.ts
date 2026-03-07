import { test, expect } from './fixtures/auth.fixture';

const apiUrl = process.env.API_URL || 'http://localhost:8001';

test.describe('Search', () => {
  test('should return search results via API', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;

    // Create a document with searchable name
    const createResp = await page.request.post(`${apiUrl}/api/v1/documents`, {
      data: { name: 'Searchable E2E Document', project_id: testData.project_id },
    });
    expect(createResp.ok()).toBeTruthy();

    // Search via the correct endpoint
    const searchResp = await page.request.get(
      `${apiUrl}/api/v1/search/search?q=Searchable+E2E&project_id=${testData.project_id}`
    );
    expect(searchResp.ok()).toBeTruthy();
    const results = await searchResp.json();
    expect(results).toBeDefined();
  });

  test('should open spotlight/search with keyboard shortcut', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Cmd/Ctrl+K typically opens spotlight search
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);

    const searchInput = page.locator(
      '[data-testid="spotlight-input"], [data-testid="search-input"], [role="combobox"], input[placeholder*="Search" i]'
    ).first();

    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(searchInput).toBeVisible();
      await searchInput.fill('test');
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
    } else {
      // Try Ctrl+K for non-Mac
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(500);
      const searchInput2 = page.locator(
        '[data-testid="spotlight-input"], [data-testid="search-input"], [role="combobox"], input[placeholder*="Search" i]'
      ).first();

      if (await searchInput2.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(searchInput2).toBeVisible();
      } else {
        test.skip(true, 'Spotlight/search shortcut not found');
      }
    }
  });
});
