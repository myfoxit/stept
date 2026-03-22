/**
 * E2E tests for context links — the core surfacing feature.
 * Tests creating, matching, and auto-generation of context links.
 */
import { test, expect } from './fixtures/auth.fixture';

const apiUrl = process.env.API_URL || 'http://localhost:8001';

/** Helper: create a finalized workflow. Returns sessionId. */
async function createWorkflow(page: any, projectId: string, url = 'https://app.salesforce.com/leads') {
  const createResp = await page.request.post(`${apiUrl}/api/v1/process-recording/session/create`, {
    data: { project_id: projectId, timestamp: new Date().toISOString() },
  });
  const session = await createResp.json();
  const sessionId = session.sessionId || session.session_id;

  await page.request.post(`${apiUrl}/api/v1/process-recording/session/${sessionId}/metadata`, {
    data: [
      { stepNumber: 1, timestamp: new Date().toISOString(), actionType: 'Left Click', description: 'Click lead', url, windowSize: { width: 1920, height: 1080 } },
    ],
  });

  await page.request.post(`${apiUrl}/api/v1/process-recording/session/${sessionId}/finalize`);
  return sessionId;
}

test.describe('Context Links API', () => {
  test('should create a manual context link', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const sessionId = await createWorkflow(page, testData.project_id);

    const resp = await page.request.post(`${apiUrl}/api/v1/context-links`, {
      data: {
        project_id: testData.project_id,
        match_type: 'url_pattern',
        match_value: '*.salesforce.com*',
        resource_type: 'workflow',
        resource_id: sessionId,
        note: 'Salesforce lead management guide',
      },
    });
    expect(resp.ok()).toBeTruthy();
    const link = await resp.json();
    expect(link.match_value).toBe('*.salesforce.com*');
    expect(link.source).toBe('user');
    expect(link.weight).toBe(1000);
  });

  test('should match context link by URL', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const sessionId = await createWorkflow(page, testData.project_id);

    // Create a link
    await page.request.post(`${apiUrl}/api/v1/context-links`, {
      data: {
        project_id: testData.project_id,
        match_type: 'url_pattern',
        match_value: '*.hubspot.com*',
        resource_type: 'workflow',
        resource_id: sessionId,
      },
    });

    // Match it
    const matchResp = await page.request.get(
      `${apiUrl}/api/v1/context-links/match?url=https://app.hubspot.com/deals/123&project_id=${testData.project_id}`,
    );
    expect(matchResp.ok()).toBeTruthy();
    const matchData = await matchResp.json();
    const matches = matchData.matches || matchData;
    expect(Array.isArray(matches)).toBeTruthy();
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((m: any) => m.resource_id === sessionId)).toBeTruthy();
  });

  test('should auto-create context links on workflow finalize', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;

    // Create workflow with a specific URL
    const sessionId = await createWorkflow(page, testData.project_id, 'https://app.notion.so/workspace/page123');

    // Check that auto link was created
    const linksResp = await page.request.get(
      `${apiUrl}/api/v1/context-links?project_id=${testData.project_id}`,
    );
    expect(linksResp.ok()).toBeTruthy();
    const links = await linksResp.json();
    const autoLinks = links.filter((l: any) => l.source === 'auto' && l.resource_id === sessionId);
    expect(autoLinks.length).toBeGreaterThan(0);
    expect(autoLinks[0].match_value).toContain('notion.so');
  });

  test('should track click on context link', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const sessionId = await createWorkflow(page, testData.project_id);

    // Create a link
    const createResp = await page.request.post(`${apiUrl}/api/v1/context-links`, {
      data: {
        project_id: testData.project_id,
        match_type: 'url_pattern',
        match_value: '*.jira.com*',
        resource_type: 'workflow',
        resource_id: sessionId,
      },
    });
    const link = await createResp.json();

    // Record a click
    const clickResp = await page.request.post(`${apiUrl}/api/v1/context-links/${link.id}/click`);
    expect(clickResp.ok()).toBeTruthy();
    const updated = await clickResp.json();
    expect(updated.click_count).toBe(1);

    // Click again
    const clickResp2 = await page.request.post(`${apiUrl}/api/v1/context-links/${link.id}/click`);
    const updated2 = await clickResp2.json();
    expect(updated2.click_count).toBe(2);
  });

  test('should list known apps', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const resp = await page.request.get(`${apiUrl}/api/v1/context-links/known-apps`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.apps).toBeDefined();
    expect(data.apps.length).toBeGreaterThan(10);
    // Should include common apps
    const names = data.apps.map((a: any) => a.name);
    expect(names).toContain('Google Chrome');
    expect(names).toContain('Visual Studio Code');
  });

  test('user links should outrank auto links in matches', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    const sessionId1 = await createWorkflow(page, testData.project_id, 'https://app.linear.app/issue/123');
    const sessionId2 = await createWorkflow(page, testData.project_id, 'https://app.linear.app/issue/456');

    // sessionId1 gets auto link from finalize (weight=100)
    // Create a user link for sessionId2 (weight=1000)
    await page.request.post(`${apiUrl}/api/v1/context-links`, {
      data: {
        project_id: testData.project_id,
        match_type: 'url_pattern',
        match_value: '*.linear.app*',
        resource_type: 'workflow',
        resource_id: sessionId2,
      },
    });

    // Match — user link should be first
    const matchResp = await page.request.get(
      `${apiUrl}/api/v1/context-links/match?url=https://app.linear.app/team/backlog&project_id=${testData.project_id}`,
    );
    const matchData = await matchResp.json();
    const matches = matchData.matches || matchData;
    if (matches.length >= 2) {
      // First match should be the user-created one (higher score)
      expect(matches[0].resource_id).toBe(sessionId2);
    }
  });
});
