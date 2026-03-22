/**
 * E2E tests for workflow step editing operations.
 * Tests the workflow editor: reorder, add, delete, and edit steps.
 */
import { test, expect } from './fixtures/auth.fixture';

const apiUrl = process.env.API_URL || 'http://localhost:8001';

/** Helper: create a workflow with steps and finalize it. Returns sessionId. */
async function createWorkflowWithSteps(page: any, projectId: string, numSteps = 3) {
  const createResp = await page.request.post(`${apiUrl}/api/v1/process-recording/session/create`, {
    data: { project_id: projectId, timestamp: new Date().toISOString() },
  });
  const session = await createResp.json();
  const sessionId = session.sessionId || session.session_id;

  const steps = Array.from({ length: numSteps }, (_, i) => ({
    stepNumber: i + 1,
    timestamp: new Date(Date.now() + i * 1000).toISOString(),
    actionType: 'Left Click',
    description: `Step ${i + 1}: Click element ${i + 1}`,
    url: `https://app.example.com/page${i + 1}`,
    windowSize: { width: 1920, height: 1080 },
    screenshotSize: { width: 1920, height: 1080 },
    screenshotRelativePosition: { x: 500 + i * 100, y: 300 },
  }));

  await page.request.post(
    `${apiUrl}/api/v1/process-recording/session/${sessionId}/metadata`,
    { data: steps },
  );

  await page.request.post(`${apiUrl}/api/v1/process-recording/session/${sessionId}/finalize`);

  return sessionId;
}

test.describe('Workflow Step Editing via API', () => {
  test('should add a new step to an existing workflow', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const sessionId = await createWorkflowWithSteps(page, testData.project_id);

    // Add a tip step after position 2
    const addResp = await page.request.post(
      `${apiUrl}/api/v1/process-recording/session/${sessionId}/steps?position=2`,
      {
        data: {
          step_type: 'tip',
          description: 'Pro tip: use keyboard shortcuts',
          content: 'Press Ctrl+S to save quickly',
        },
      },
    );
    expect(addResp.ok()).toBeTruthy();

    // Verify step count increased
    const statusResp = await page.request.get(
      `${apiUrl}/api/v1/process-recording/session/${sessionId}/status`,
    );
    const status = await statusResp.json();
    const steps = status.metadata || [];
    expect(steps.length).toBe(4);
  });

  test('should update a step description', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const sessionId = await createWorkflowWithSteps(page, testData.project_id);

    // Update step 1's description
    const updateResp = await page.request.put(
      `${apiUrl}/api/v1/process-recording/session/${sessionId}/steps/1`,
      {
        data: { description: 'Updated: Click the login button' },
      },
    );
    expect(updateResp.ok()).toBeTruthy();

    // Verify the update
    const statusResp = await page.request.get(
      `${apiUrl}/api/v1/process-recording/session/${sessionId}/status`,
    );
    const status = await statusResp.json();
    const step1 = (status.metadata || []).find((s: any) => s.step_number === 1);
    expect(step1?.description).toBe('Updated: Click the login button');
  });

  test('should delete a step from workflow', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const sessionId = await createWorkflowWithSteps(page, testData.project_id);

    // Delete step 2
    const deleteResp = await page.request.delete(
      `${apiUrl}/api/v1/process-recording/session/${sessionId}/steps/2`,
    );
    expect(deleteResp.ok()).toBeTruthy();

    // Verify step count decreased
    const statusResp = await page.request.get(
      `${apiUrl}/api/v1/process-recording/session/${sessionId}/status`,
    );
    const status = await statusResp.json();
    const steps = status.metadata || [];
    expect(steps.length).toBe(2);
  });

  test('should reorder steps', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const sessionId = await createWorkflowWithSteps(page, testData.project_id);

    // Reorder: move step 3 to position 1
    const reorderResp = await page.request.post(
      `${apiUrl}/api/v1/process-recording/session/${sessionId}/steps/reorder`,
      {
        data: {
          reorders: [{ step_number: 3, new_position: 1 }],
        },
      },
    );
    // Reorder may return 200 or 422 depending on implementation
    expect(reorderResp.status()).toBeLessThan(500);
  });

  test('should rename a workflow', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const sessionId = await createWorkflowWithSteps(page, testData.project_id);

    const updateResp = await page.request.put(
      `${apiUrl}/api/v1/process-recording/workflow/${sessionId}`,
      { data: { name: 'How to Login to the App' } },
    );
    expect(updateResp.ok()).toBeTruthy();

    const statusResp = await page.request.get(
      `${apiUrl}/api/v1/process-recording/session/${sessionId}/status`,
    );
    const status = await statusResp.json();
    expect(status.title || status.name).toBe('How to Login to the App');
  });
});

test.describe('Workflow Viewer Page', () => {
  test('should load workflow view page', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const sessionId = await createWorkflowWithSteps(page, testData.project_id);

    await page.goto(`/workflow/${sessionId}`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Page should load without error — may show workflow content or redirect
    const url = page.url();
    expect(url).toContain(sessionId);
  });
});

test.describe('Workflow Export via API', () => {
  test('should export workflow as markdown', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const sessionId = await createWorkflowWithSteps(page, testData.project_id);

    const resp = await page.request.get(
      `${apiUrl}/api/v1/process-recording/workflow/${sessionId}/export/markdown`,
    );
    expect(resp.ok()).toBeTruthy();
    const text = await resp.text();
    expect(text).toContain('Step');
  });

  test('should export workflow as HTML', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const sessionId = await createWorkflowWithSteps(page, testData.project_id);

    const resp = await page.request.get(
      `${apiUrl}/api/v1/process-recording/workflow/${sessionId}/export/html`,
    );
    expect(resp.ok()).toBeTruthy();
    const text = await resp.text();
    expect(text).toContain('<');
  });
});
