/**
 * E2E tests for public workflow/document viewer.
 */
import { test, expect } from './fixtures/auth.fixture';
import { getTestUrls } from './helpers/config';

const apiUrl = process.env.API_URL || 'http://localhost:8001';

/** Helper: create a workflow with steps, finalize, make public. Returns { sessionId, shareToken }. */
async function createPublicWorkflow(page: any, projectId: string) {
  const createResp = await page.request.post(`${apiUrl}/api/v1/process-recording/session/create`, {
    data: { project_id: projectId, timestamp: new Date().toISOString() },
  });
  const session = await createResp.json();
  const sessionId = session.sessionId || session.session_id;

  await page.request.post(`${apiUrl}/api/v1/process-recording/session/${sessionId}/metadata`, {
    data: [
      { stepNumber: 1, timestamp: new Date().toISOString(), actionType: 'Left Click', description: 'Click login button', url: 'https://app.example.com/login', windowSize: { width: 1920, height: 1080 } },
      { stepNumber: 2, timestamp: new Date().toISOString(), actionType: 'Type', description: 'Type email address', textTyped: 'user@test.com', windowSize: { width: 1920, height: 1080 } },
      { stepNumber: 3, timestamp: new Date().toISOString(), actionType: 'Left Click', description: 'Click submit', url: 'https://app.example.com/dashboard', windowSize: { width: 1920, height: 1080 } },
    ],
  });

  await page.request.post(`${apiUrl}/api/v1/process-recording/session/${sessionId}/finalize`);

  // Make public (POST endpoint)
  const shareResp = await page.request.post(
    `${apiUrl}/api/v1/process-recording/workflow/${sessionId}/share/public`,
  );
  expect(shareResp.ok()).toBeTruthy();
  const shareData = await shareResp.json();
  return { sessionId, shareToken: shareData.share_token };
}

test.describe('Public Workflow Viewer', () => {
  test('should load public workflow with steps', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const { shareToken } = await createPublicWorkflow(page, testData.project_id);
    expect(shareToken).toBeTruthy();

    await page.goto(`/public/workflow/${shareToken}`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Should show workflow content (expanded mode — step descriptions)
    await expect(page.locator('body')).toContainText('Click login button', { timeout: 10000 });
  });

  test('should load public workflow in slides mode', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const { shareToken } = await createPublicWorkflow(page, testData.project_id);

    await page.goto(`/public/workflow/${shareToken}?mode=slides`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Slides mode shows step counter and navigation (screenshots may be missing in test)
    await expect(page.locator('text=/Step 1/i').or(page.locator('text=/1 of/i').or(page.locator('text=Click login button')))).toBeVisible({ timeout: 10000 });
  });

  test('should navigate steps in slides mode', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const { shareToken } = await createPublicWorkflow(page, testData.project_id);

    await page.goto(`/public/workflow/${shareToken}?mode=slides`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Should show step counter
    await expect(page.locator('text=/Step 1/i').or(page.locator('text=/1 of/i'))).toBeVisible({ timeout: 10000 });

    // Click Next
    const nextBtn = page.locator('button:has-text("Next")');
    if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(500);
      // Step should advance
      await expect(page.locator('text=/Step 2/i').or(page.locator('text=/2 of/i'))).toBeVisible({ timeout: 5000 });
    }
  });

  test('should load sandbox mode', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const { shareToken } = await createPublicWorkflow(page, testData.project_id);

    await page.goto(`/public/workflow/${shareToken}?mode=sandbox`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Sandbox mode shows step indicator or step description
    await expect(page.locator('text=/Step 1/i').or(page.locator('text=/steps/i')).or(page.locator('text=Click login button'))).toBeVisible({ timeout: 10000 });
  });

  test('should show error for invalid share token', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/public/workflow/invalid_token_that_does_not_exist');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    await expect(page.locator('text=/not found/i')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Public Workflow API', () => {
  test('should return public workflow data via API', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const { shareToken } = await createPublicWorkflow(page, testData.project_id);

    const resp = await page.request.get(`${apiUrl}/api/v1/public/workflow/${shareToken}`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.steps).toBeDefined();
    expect(data.steps.length).toBe(3);
    expect(data.steps[0].description).toBe('Click login button');
  });

  test('should return 404 for invalid share token via API', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const resp = await page.request.get(`${apiUrl}/api/v1/public/workflow/nonexistent_token`);
    expect(resp.status()).toBe(404);
  });
});
