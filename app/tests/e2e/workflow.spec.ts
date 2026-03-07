import { test, expect } from './fixtures/auth.fixture';

const apiUrl = process.env.API_URL || 'http://localhost:8001';

function createSession(page: any, projectId: string) {
  return page.request.post(`${apiUrl}/api/v1/process-recording/session/create`, {
    data: { project_id: projectId, timestamp: new Date().toISOString() },
  });
}

test.describe('Workflow Operations', () => {
  test('should create a workflow session via API and view it', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const resp = await createSession(page, testData.project_id);
    expect(resp.ok()).toBeTruthy();
    const session = await resp.json();
    expect(session.sessionId).toBeTruthy();

    await page.goto(`/workflow/${session.sessionId}`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await expect(page).toHaveURL(new RegExp(`/workflow/${session.sessionId}`), { timeout: 10000 });
  });

  test('should list workflows via API', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const resp = await createSession(page, testData.project_id);
    expect(resp.ok()).toBeTruthy();

    const listResp = await page.request.get(
      `${apiUrl}/api/v1/process-recording/sessions?project_id=${testData.project_id}`
    );
    expect(listResp.ok()).toBeTruthy();
    const sessions = await listResp.json();
    const items = sessions.sessions || sessions.items || sessions;
    expect(Array.isArray(items)).toBeTruthy();
    expect(items.length).toBeGreaterThan(0);
  });

  test('should upload step metadata to workflow via API', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const resp = await createSession(page, testData.project_id);
    const session = await resp.json();

    // Metadata endpoint expects a JSON array of StepMetadata directly
    const metaResp = await page.request.post(
      `${apiUrl}/api/v1/process-recording/session/${session.sessionId}/metadata`,
      {
        data: [
          {
            stepNumber: 1,
            timestamp: new Date().toISOString(),
            actionType: 'click',
            windowTitle: 'Test App',
            description: 'Click submit button',
          },
        ],
      }
    );
    expect(metaResp.ok()).toBeTruthy();
  });

  test('should finalize workflow via API', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const resp = await createSession(page, testData.project_id);
    const session = await resp.json();

    const finalizeResp = await page.request.post(
      `${apiUrl}/api/v1/process-recording/session/${session.sessionId}/finalize`
    );
    expect(finalizeResp.ok()).toBeTruthy();

    const statusResp = await page.request.get(
      `${apiUrl}/api/v1/process-recording/session/${session.sessionId}/status`
    );
    expect(statusResp.ok()).toBeTruthy();
    const status = await statusResp.json();
    expect(status.status).toBe('completed');
  });

  test('should duplicate workflow via API', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const resp = await createSession(page, testData.project_id);
    const session = await resp.json();

    await page.request.post(
      `${apiUrl}/api/v1/process-recording/session/${session.sessionId}/finalize`
    );

    const dupeResp = await page.request.post(
      `${apiUrl}/api/v1/process-recording/workflow/${session.sessionId}/duplicate`
    );
    expect(dupeResp.ok()).toBeTruthy();
    const dupe = await dupeResp.json();
    expect(dupe.sessionId || dupe.session_id || dupe.id).not.toBe(session.sessionId);
  });
});
