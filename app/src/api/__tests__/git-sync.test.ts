import * as gitSyncApi from '../git-sync';

jest.mock('@/lib/apiClient', () => {
  const mockRequest = jest.fn();
  return {
    apiClient: { request: jest.fn() },
    request: mockRequest,
    getApiBaseUrl: () => 'http://localhost:8000/api/v1',
  };
});

import { request } from '@/lib/apiClient';
const mockRequest = request as jest.MockedFunction<typeof request>;

describe('Git Sync API', () => {
  afterEach(() => jest.clearAllMocks());

  it('getGitSyncConfig calls GET endpoint', async () => {
    const config = { id: 'cfg-1', project_id: 'p1' } as any;
    mockRequest.mockResolvedValueOnce(config);

    const result = await gitSyncApi.getGitSyncConfig('p1');

    expect(mockRequest).toHaveBeenCalledWith({ method: 'GET', url: '/git-sync/p1' });
    expect(result).toEqual(config);
  });

  it('upsertGitSyncConfig calls PUT endpoint with payload', async () => {
    const input: gitSyncApi.GitSyncConfigInput = {
      provider: 'github',
      repo_url: 'https://github.com/acme/repo',
      branch: 'main',
      directory: '/docs',
      access_token: 'ghp_xxx',
    };
    mockRequest.mockResolvedValueOnce({ id: 'cfg-1' } as any);

    await gitSyncApi.upsertGitSyncConfig('p1', input);

    expect(mockRequest).toHaveBeenCalledWith({ method: 'PUT', url: '/git-sync/p1', data: input });
  });

  it('deleteGitSyncConfig calls DELETE endpoint', async () => {
    mockRequest.mockResolvedValueOnce(undefined as any);

    await gitSyncApi.deleteGitSyncConfig('p1');

    expect(mockRequest).toHaveBeenCalledWith({ method: 'DELETE', url: '/git-sync/p1' });
  });

  it('exportToGit calls export endpoint', async () => {
    const resp = { status: 'ok', exported: 12 };
    mockRequest.mockResolvedValueOnce(resp as any);

    const result = await gitSyncApi.exportToGit('p1');

    expect(mockRequest).toHaveBeenCalledWith({ method: 'POST', url: '/git-sync/p1/export' });
    expect(result).toEqual(resp);
  });

  it('testGitConnection calls test endpoint with payload', async () => {
    const input: gitSyncApi.GitSyncConfigInput = {
      provider: 'gitlab',
      repo_url: 'https://gitlab.com/acme/repo',
      branch: 'master',
      directory: '/',
      access_token: 'glpat_xxx',
    };
    mockRequest.mockResolvedValueOnce({ status: 'success' } as any);

    await gitSyncApi.testGitConnection('p1', input);

    expect(mockRequest).toHaveBeenCalledWith({ method: 'POST', url: '/git-sync/p1/test', data: input });
  });

  it.each([
    ['github', 'https://github.com/org/repo', 'main'],
    ['gitlab', 'https://gitlab.com/org/repo', 'develop'],
    ['bitbucket', 'https://bitbucket.org/org/repo', 'master'],
  ] as const)(
    'upsert supports provider=%s repo=%s branch=%s',
    async (provider, repo, branch) => {
      mockRequest.mockResolvedValueOnce({ id: 'cfg-2' } as any);
      await gitSyncApi.upsertGitSyncConfig('project-9', {
        provider,
        repo_url: repo,
        branch,
        directory: '/export',
        access_token: 'token',
      });

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          url: '/git-sync/project-9',
          data: expect.objectContaining({ provider, repo_url: repo, branch }),
        }),
      );
    },
  );

  it.each(['/docs', '/', 'nested/path', './relative'])(
    'upsert preserves directory %s',
    async (directory) => {
      mockRequest.mockResolvedValueOnce({ id: 'cfg-3' } as any);
      await gitSyncApi.upsertGitSyncConfig('project-dir', {
        provider: 'github',
        repo_url: 'https://github.com/acme/docs',
        branch: 'main',
        directory,
        access_token: 'tok',
      });

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ directory }),
        }),
      );
    },
  );

  it.each(['p-alpha', 'p-beta', '123'])('all endpoints compose project id %s consistently', async (projectId) => {
    mockRequest.mockResolvedValue(undefined as any);

    await gitSyncApi.getGitSyncConfig(projectId);
    await gitSyncApi.deleteGitSyncConfig(projectId);
    await gitSyncApi.exportToGit(projectId);

    const calledUrls = mockRequest.mock.calls.map((c) => c[0]?.url);
    expect(calledUrls).toEqual([
      `/git-sync/${projectId}`,
      `/git-sync/${projectId}`,
      `/git-sync/${projectId}/export`,
    ]);
  });
});
