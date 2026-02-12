import { apiClient } from '@/lib/apiClient';
import * as chatApi from '../chat';

jest.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    put: jest.fn(),
  },
  getApiBaseUrl: () => 'http://localhost:8000/api/v1',
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('Chat API', () => {
  afterEach(() => jest.clearAllMocks());

  describe('fetchChatConfig', () => {
    it('returns chat configuration', async () => {
      const config = {
        provider: 'openai',
        model: 'gpt-4o',
        base_url: null,
        dataveil_enabled: false,
        configured: true,
      };
      mockApiClient.get.mockResolvedValueOnce({ data: config });

      const result = await chatApi.fetchChatConfig();
      expect(mockApiClient.get).toHaveBeenCalledWith('/chat/config');
      expect(result).toEqual(config);
    });
  });

  describe('updateChatConfig', () => {
    it('saves config via PUT', async () => {
      const updated = { provider: 'anthropic', model: 'claude-3', configured: true };
      mockApiClient.put.mockResolvedValueOnce({ data: updated });

      const result = await chatApi.updateChatConfig({
        provider: 'anthropic',
        model: 'claude-3',
      });
      expect(mockApiClient.put).toHaveBeenCalledWith('/chat/config', {
        provider: 'anthropic',
        model: 'claude-3',
      });
      expect(result.provider).toBe('anthropic');
    });
  });

  describe('fetchChatModels', () => {
    it('returns model list', async () => {
      const models = [
        { id: 'gpt-4o', name: 'GPT-4o' },
        { id: 'claude-3', name: 'Claude 3' },
      ];
      mockApiClient.get.mockResolvedValueOnce({ data: { models } });

      const result = await chatApi.fetchChatModels();
      expect(result).toEqual(models);
    });
  });

  describe('fetchChatTools', () => {
    it('returns available tools', async () => {
      const tools = [
        { name: 'create_folder', description: 'Creates a folder', parameters: {} },
      ];
      mockApiClient.get.mockResolvedValueOnce({ data: { tools } });

      const result = await chatApi.fetchChatTools();
      expect(result).toEqual(tools);
    });
  });

  describe('streamChatCompletion', () => {
    it('handles abort gracefully', async () => {
      const controller = new AbortController();
      controller.abort();

      const onChunk = jest.fn();
      const onDone = jest.fn();
      const onError = jest.fn();

      // Mock fetch to throw AbortError
      global.fetch = jest.fn().mockRejectedValue(
        new DOMException('Aborted', 'AbortError')
      );

      await chatApi.streamChatCompletion(
        { messages: [{ role: 'user', content: 'hello' }] },
        onChunk,
        onDone,
        onError,
        controller.signal,
      );

      expect(onDone).toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('calls onError on network failure', async () => {
      const onChunk = jest.fn();
      const onDone = jest.fn();
      const onError = jest.fn();

      global.fetch = jest.fn().mockRejectedValue(new Error('Network failure'));

      await chatApi.streamChatCompletion(
        { messages: [{ role: 'user', content: 'hello' }] },
        onChunk,
        onDone,
        onError,
      );

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Network failure',
      }));
    });
  });
});
