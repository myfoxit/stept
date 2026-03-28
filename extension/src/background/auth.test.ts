jest.mock('./settings', () => ({
  getApiBaseUrl: jest.fn().mockResolvedValue('https://api.test/api/v1'),
}));

jest.mock('./state', () => {
  const actual = jest.requireActual('./state');
  return {
    ...actual,
    persistAuth: jest.fn().mockResolvedValue(undefined),
    debugLog: jest.fn(),
  };
});

describe('background/auth', () => {
  const localRemove = jest.fn().mockResolvedValue(undefined);
  let authedFetch: typeof import('./auth').authedFetch;
  let refreshAccessToken: typeof import('./auth').refreshAccessToken;
  let tryAutoLogin: typeof import('./auth').tryAutoLogin;
  let persistAuth: typeof import('./state').persistAuth;
  let state: typeof import('./state').state;

  beforeAll(async () => {
    (globalThis as any).chrome = {
      storage: { local: { remove: localRemove } },
      alarms: { create: jest.fn(), onAlarm: { addListener: jest.fn() } },
      runtime: { sendMessage: jest.fn().mockResolvedValue(undefined) },
    };

    ({ authedFetch, refreshAccessToken, tryAutoLogin } = await import('./auth'));
    ({ persistAuth, state } = await import('./state'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).chrome = {
      storage: {
        local: { remove: localRemove },
      },
      alarms: { create: jest.fn(), onAlarm: { addListener: jest.fn() } },
      runtime: { sendMessage: jest.fn().mockResolvedValue(undefined) },
    };
    state.accessToken = 'access_1';
    state.refreshToken = 'refresh_1';
    state.isAuthenticated = true;
    state.currentUser = { id: 'user_1' };
    state.userProjects = [{ id: 'proj_1' }];
    globalThis.fetch = jest.fn() as any;
  });

  it('refreshes access tokens and persists the new auth state', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'access_2',
      refresh_token: 'refresh_2',
    }), { status: 200 }));

    await expect(refreshAccessToken()).resolves.toBe(true);

    expect(state.accessToken).toBe('access_2');
    expect(state.refreshToken).toBe('refresh_2');
    expect(state.isAuthenticated).toBe(true);
    expect(persistAuth).toHaveBeenCalled();
  });

  it('clears auth state when token refresh is rejected', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(new Response('', { status: 401 }));

    await expect(refreshAccessToken()).resolves.toBe(false);

    expect(state.isAuthenticated).toBe(false);
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.currentUser).toBeNull();
    expect(state.userProjects).toEqual([]);
    expect(localRemove).toHaveBeenCalledWith([
      'refreshToken',
      'accessToken',
      'currentUser',
      'userProjects',
    ]);
  });

  it('adds bearer auth and retries once after a 401 with a refreshed token', async () => {
    state.accessToken = 'expired';
    const first = new Response('', { status: 401 });
    const refresh = new Response(JSON.stringify({
      access_token: 'fresh_access',
      refresh_token: 'fresh_refresh',
    }), { status: 200 });
    const second = new Response(JSON.stringify({ ok: true }), { status: 200 });
    jest.mocked(globalThis.fetch)
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(refresh)
      .mockResolvedValueOnce(second);

    const response = await authedFetch('https://service.test/data', { headers: { 'X-Test': '1' } });

    expect(response.status).toBe(200);
    expect(jest.mocked(globalThis.fetch).mock.calls[0]?.[0]).toBe('https://service.test/data');
    expect(jest.mocked(globalThis.fetch).mock.calls[1]?.[0]).toBe('https://api.test/api/v1/auth/token');
    expect(jest.mocked(globalThis.fetch).mock.calls[2]?.[0]).toBe('https://service.test/data');
    expect(jest.mocked(globalThis.fetch).mock.calls[2]?.[1]).toMatchObject({
      headers: {
        'X-Test': '1',
        Authorization: 'Bearer fresh_access',
      },
    });
  });

  it('throws when no access token can be established', async () => {
    state.accessToken = null;
    state.refreshToken = null;

    await expect(authedFetch('https://service.test/data')).rejects.toThrow('Not authenticated');
  });

  it('auto-login clears invalid refresh tokens after auth rejection', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(new Response('', { status: 403 }));

    await expect(tryAutoLogin()).resolves.toBe(false);

    expect(state.refreshToken).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(localRemove).toHaveBeenCalledWith([
      'refreshToken',
      'accessToken',
      'currentUser',
      'userProjects',
    ]);
  });
});
