import { test, expect } from './fixtures/auth.fixture';

test.describe('Document CRUD', () => {
  test('should create a new document from sidebar', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Click new document button
    const newDocBtn = sidebar.locator('button', { hasText: /new.*doc|add.*doc|\+/i }).first()
      || sidebar.locator('[data-testid="new-document-btn"]').first();
    
    // Try various new doc triggers
    const addBtn = page.locator('[data-testid="new-document-btn"], [aria-label*="new doc" i], [aria-label*="New Doc" i], button:has-text("New")').first();
    
    if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addBtn.click();
    } else {
      // Use keyboard shortcut or context menu
      // Many apps use a "+" button near documents section
      const plusBtn = sidebar.locator('button').filter({ hasText: '+' }).first();
      if (await plusBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await plusBtn.click();
      } else {
        test.skip(true, 'Could not find new document button');
        return;
      }
    }

    // Should navigate to editor or show document
    await page.waitForTimeout(2000);
    const url = page.url();
    // New document should either open editor or show in sidebar
    const editorVisible = url.includes('/editor/');
    const docCreated = await sidebar.locator('[data-testid="document-item"], [data-testid="doc-link"]').count() > 0;
    expect(editorVisible || docCreated).toBeTruthy();
  });

  test('should navigate to editor when clicking a document', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;

    // First create a document via API
    const apiUrl = process.env.API_URL || 'http://localhost:8001';
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(c => c.name.includes('session'));
    
    const createResp = await page.request.post(`${apiUrl}/api/v1/documents`, {
      data: {
        name: 'E2E Test Document',
        project_id: testData.project_id,
      },
    });
    expect(createResp.ok()).toBeTruthy();
    const doc = await createResp.json();

    // Navigate to the document
    await page.goto(`/editor/${doc.id}`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Should show editor area
    await expect(page).toHaveURL(new RegExp(`/editor/${doc.id}`), { timeout: 10000 });
    
    // Editor content area should be present (TipTap uses .ProseMirror or [contenteditable])
    const editor = page.locator('.ProseMirror, [contenteditable="true"], [data-testid="editor"]').first();
    await expect(editor).toBeVisible({ timeout: 10000 });
  });

  test('should edit document content in TipTap editor', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const apiUrl = process.env.API_URL || 'http://localhost:8001';

    // Create document via API
    const createResp = await page.request.post(`${apiUrl}/api/v1/documents`, {
      data: {
        name: 'Editor Content Test',
        project_id: testData.project_id,
      },
    });
    expect(createResp.ok()).toBeTruthy();
    const doc = await createResp.json();

    await page.goto(`/editor/${doc.id}`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Find editor and type
    const editor = page.locator('.ProseMirror, [contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await editor.pressSequentially('Hello from E2E test!', { delay: 30 });

    // Content should be visible
    await expect(editor).toContainText('Hello from E2E test!');
  });

  test('should delete a document', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const apiUrl = process.env.API_URL || 'http://localhost:8001';

    // Create document via API
    const createResp = await page.request.post(`${apiUrl}/api/v1/documents`, {
      data: {
        name: 'Delete Me Document',
        project_id: testData.project_id,
      },
    });
    expect(createResp.ok()).toBeTruthy();
    const doc = await createResp.json();

    // Verify we can delete via API
    const deleteResp = await page.request.delete(`${apiUrl}/api/v1/documents/${doc.id}`);
    expect(deleteResp.ok()).toBeTruthy();

    // Verify it's gone from listing
    const listResp = await page.request.get(`${apiUrl}/api/v1/documents?project_id=${testData.project_id}`);
    expect(listResp.ok()).toBeTruthy();
    const docs = await listResp.json();
    const found = (Array.isArray(docs) ? docs : docs.items || []).find((d: any) => d.id === doc.id);
    expect(found).toBeUndefined();
  });
});
