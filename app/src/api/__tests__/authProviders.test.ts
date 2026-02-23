import { apiClient } from '@/lib/apiClient';
import {
  disconnectCopilot,
  fetchProvidersStatus,
  pollCopilotDeviceFlow,
  startCopilotDeviceFlow,
} from '../authProviders';

jest.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('authProviders API', () => {
  afterEach(() => jest.clearAllMocks());

  it('starts copilot device flow', async () => {
    mockApiClient.post.mockResolvedValueOnce({
      data: {
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.com/login/device',
        interval: 5,
        expires_in: 900,
      },
    } as never);

    const result = await startCopilotDeviceFlow();
    expect(mockApiClient.post).toHaveBeenCalledWith('/auth/providers/copilot/start');
    expect(result.user_code).toBe('ABCD-EFGH');
  });

  it.each(['pending', 'success', 'expired', 'error'] as const)(
    'polls copilot device flow with status %s',
    async (status) => {
      mockApiClient.post.mockResolvedValueOnce({ data: { status } } as never);
      const result = await pollCopilotDeviceFlow();
      expect(mockApiClient.post).toHaveBeenCalledWith('/auth/providers/copilot/poll');
      expect(result.status).toBe(status);
    },
  );

  it('disconnects copilot', async () => {
    mockApiClient.post.mockResolvedValueOnce({} as never);
    await disconnectCopilot();
    expect(mockApiClient.post).toHaveBeenCalledWith('/auth/providers/copilot/disconnect');
  });

  it('fetches providers status', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: { providers: [{ provider: 'copilot', connected: true }] },
    } as never);

    const result = await fetchProvidersStatus();
    expect(mockApiClient.get).toHaveBeenCalledWith('/auth/providers/status');
    expect(result.providers).toHaveLength(1);
  });
});
