import { test, expect } from './fixtures/auth.fixture';

test.describe('Trash Operations', () => {
  test('should navigate to trash page', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Click trash in sidebar or navigate directly
    const trashLink = page.locator('a[href="/trash"], [data-testid="trash-link"]').first();
    if (await trashLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await trashLink.click();
    } else {
      await page.goto('/trash');
    }

    await expect(page).toHaveURL(/\/trash/, { timeout: 10000 });
  });

  test('should show deleted documents in trash', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const apiUrl = process.env.API_URL || 'http://localhost:8001';

    // Create and soft-delete a document via API
    const createResp = await page.request.post(`${apiUrl}/api/v1/documents`, {
      data: { name: 'Trash Test Doc', project_id: testData.project_id },
    });
    expect(createResp.ok()).toBeTruthy();
    const doc = await createResp.json();

    const deleteResp = await page.request.delete(`${apiUrl}/api/v1/documents/${doc.id}`);
    expect(deleteResp.ok()).toBeTruthy();

    // Navigate to trash page
    await page.goto('/trash');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Should show the deleted document
    await expect(page.getByText('Trash Test Doc')).toBeVisible({ timeout: 10000 });
  });

  test('should restore a document from trash via API', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const apiUrl = process.env.API_URL || 'http://localhost:8001';

    // Create, delete, then restore
    const createResp = await page.request.post(`${apiUrl}/api/v1/documents`, {
      data: { name: 'Restore Me Doc', project_id: testData.project_id },
    });
    const doc = await createResp.json();
    await page.request.delete(`${apiUrl}/api/v1/documents/${doc.id}`);

    // Restore
    const restoreResp = await page.request.post(`${apiUrl}/api/v1/documents/${doc.id}/restore`);
    expect(restoreResp.ok()).toBeTruthy();

    // Should be back in listing
    const listResp = await page.request.get(`${apiUrl}/api/v1/documents?project_id=${testData.project_id}`);
    const docs = await listResp.json();
    const found = (Array.isArray(docs) ? docs : docs.items || []).find((d: any) => d.id === doc.id);
    expect(found).toBeDefined();
  });

  test('should permanently delete a document', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const apiUrl = process.env.API_URL || 'http://localhost:8001';

    // Create and soft-delete
    const createResp = await page.request.post(`${apiUrl}/api/v1/documents`, {
      data: { name: 'Perm Delete Doc', project_id: testData.project_id },
    });
    const doc = await createResp.json();
    await page.request.delete(`${apiUrl}/api/v1/documents/${doc.id}`);

    // Permanently delete
    const permDeleteResp = await page.request.delete(`${apiUrl}/api/v1/documents/${doc.id}/permanent`);
    expect(permDeleteResp.ok()).toBeTruthy();

    // Should not be in trash
    const trashResp = await page.request.get(`${apiUrl}/api/v1/documents/trash?project_id=${testData.project_id}`);
    if (trashResp.ok()) {
      const trashDocs = await trashResp.json();
      const found = (Array.isArray(trashDocs) ? trashDocs : trashDocs.items || []).find((d: any) => d.id === doc.id);
      expect(found).toBeUndefined();
    }
  });
});
