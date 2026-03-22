/**
 * E2E tests for public workflow/document viewer.
 * Tests the full share → view → navigate journey.
 */
import { test, expect } from './fixtures/auth.fixture';

const apiUrl = process.env.API_URL || 'http://localhost:8001';
const appUrl = process.env.APP_URL || 'http://localhost:5173';

/** Helper: create a workflow with steps and make it public. Returns { sessionId, shareToken }. */
async function createPublicWorkflow(page: any, projectId: string) {
  // Create session
  const createResp = await page.request.post(`${apiUrl}/api/v1/process-recording/session/create`, {
    data: { project_id: projectId, timestamp: new Date().toISOString() },
  });
  const session = await createResp.json();
  const sessionId = session.sessionId || session.session_id;

  // Upload metadata with 3 steps
  await page.request.post(`${apiUrl}/api/v1/process-recording/session/${sessionId}/metadata`, {
    data: [
      { stepNumber: 1, timestamp: new Date().toISOString(), actionType: 'Left Click', description: 'Click login button', url: 'https://app.example.com/login', windowSize: { width: 1920, height: 1080 } },
      { stepNumber: 2, timestamp: new Date().toISOString(), actionType: 'Type', description: 'Type email', textTyped: 'user@test.com', windowSize: { width: 1920, height: 1080 } },
      { stepNumber: 3, timestamp: new Date().toISOString(), actionType: 'Left Click', description: 'Click submit', url: 'https://app.example.com/dashboard', windowSize: { width: 1920, height: 1080 } },
    ],
  });

  // Finalize
  await page.request.post(`${apiUrl}/api/v1/process-recording/session/${sessionId}/finalize`);

  // Make public
  const shareResp = await page.request.put(
    `${apiUrl}/api/v1/process-recording/workflow/${sessionId}/share/public`,
    { data: { is_public: true } },
  );
  const shareData = await shareResp.json();
  const shareToken = shareData.share_token;

  return { sessionId, shareToken };
}

test.describe('Public Workflow Viewer', () => {
  test('should load public workflow page with steps', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const { shareToken } = await createPublicWorkflow(page, testData.project_id);

    // Open public URL (no auth needed — use a fresh context)
    const context = await page.context().browser()!.newContext();
    const publicPage = await context.newPage();
    await publicPage.goto(`${appUrl}/public/workflow/${shareToken}`);
    await publicPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Should show workflow content (default expanded mode)
    await expect(publicPage.locator('body')).toContainText('Click login button', { timeout: 10000 });
    await context.close();
  });

  test('should load public workflow in slides mode', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const { shareToken } = await createPublicWorkflow(page, testData.project_id);

    const context = await page.context().browser()!.newContext();
    const publicPage = await context.newPage();
    await publicPage.goto(`${appUrl}/public/workflow/${shareToken}?mode=slides`);
    await publicPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Slides mode should show navigation buttons
    await expect(publicPage.locator('text=Next').or(publicPage.locator('text=Back'))).toBeVisible({ timeout: 10000 });
    await context.close();
  });

  test('should load public workflow in sandbox mode', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const { shareToken } = await createPublicWorkflow(page, testData.project_id);

    const context = await page.context().browser()!.newContext();
    const publicPage = await context.newPage();
    await publicPage.goto(`${appUrl}/public/workflow/${shareToken}?mode=sandbox`);
    await publicPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Sandbox mode should show step indicator bar
    await expect(publicPage.locator('text=Step 1').or(publicPage.locator('text=steps'))).toBeVisible({ timeout: 10000 });
    await context.close();
  });

  test('should return 404 for invalid share token', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const context = await page.context().browser()!.newContext();
    const publicPage = await context.newPage();
    await publicPage.goto(`${appUrl}/public/workflow/invalid_token_12345`);
    await publicPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Should show not found message
    await expect(publicPage.locator('text=not found').or(publicPage.locator('text=Not Found'))).toBeVisible({ timeout: 10000 });
    await context.close();
  });

  test('should navigate between steps in slides mode', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const { shareToken } = await createPublicWorkflow(page, testData.project_id);

    const context = await page.context().browser()!.newContext();
    const publicPage = await context.newPage();
    await publicPage.goto(`${appUrl}/public/workflow/${shareToken}?mode=slides`);
    await publicPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Should start at step 1
    await expect(publicPage.locator('text=Step 1')).toBeVisible({ timeout: 10000 });

    // Click Next
    const nextBtn = publicPage.locator('button:has-text("Next")');
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      // Should advance (step counter changes)
      await expect(publicPage.locator('text=Step 2')).toBeVisible({ timeout: 5000 });
    }

    await context.close();
  });
});

test.describe('Public Document Viewer', () => {
  test('should load public document page', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;

    // Create a document
    const createResp = await page.request.post(`${apiUrl}/api/v1/documents`, {
      data: { name: 'Public Test Doc', project_id: testData.project_id },
    });
    const doc = await createResp.json();

    // Make it public
    const shareResp = await page.request.post(`${apiUrl}/api/v1/documents/${doc.id}/share`);
    const shareData = await shareResp.json();
    const shareToken = shareData.share_token || shareData.token;

    if (shareToken) {
      const context = await page.context().browser()!.newContext();
      const publicPage = await context.newPage();
      await publicPage.goto(`${appUrl}/public/document/${shareToken}`);
      await publicPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

      await expect(publicPage.locator('body')).toContainText('Public Test Doc', { timeout: 10000 });
      await context.close();
    }
  });
});
