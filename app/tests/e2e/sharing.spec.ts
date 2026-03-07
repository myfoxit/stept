import { test, expect } from './fixtures/auth.fixture';

const apiUrl = process.env.API_URL || 'http://localhost:8001';

test.describe('Sharing', () => {
  test('should generate a share link for a document', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;

    const createResp = await page.request.post(`${apiUrl}/api/v1/documents`, {
      data: { name: 'Share Test Doc', project_id: testData.project_id },
    });
    expect(createResp.ok()).toBeTruthy();
    const doc = await createResp.json();

    // Share via the document share endpoint
    const shareResp = await page.request.post(`${apiUrl}/api/v1/documents/${doc.id}/share`);
    expect(shareResp.ok()).toBeTruthy();
    const share = await shareResp.json();
    expect(share.share_token || share.token || share.url).toBeTruthy();
  });

  test('should create project invite link', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;

    const inviteResp = await page.request.post(
      `${apiUrl}/api/v1/projects/${testData.project_id}/invite`,
      {
        data: {
          email: 'invite-test@example.com',
          role: 'viewer',
        },
      }
    );
    expect(inviteResp.ok()).toBeTruthy();
    const invite = await inviteResp.json();
    expect(invite.token).toBeTruthy();
    // HMAC-signed token has payload.signature format
    expect(invite.token).toContain('.');
  });
});

test.describe('Project Team', () => {
  test('should navigate to team page', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/team');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await expect(page).toHaveURL(/\/team/, { timeout: 10000 });
  });

  test('should show project members', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;

    const membersResp = await page.request.get(
      `${apiUrl}/api/v1/projects/${testData.project_id}/members`
    );
    expect(membersResp.ok()).toBeTruthy();
    const members = await membersResp.json();
    expect(Array.isArray(members)).toBeTruthy();
    expect(members.length).toBeGreaterThanOrEqual(1);
  });
});
