import * as searchApi from '../search';

jest.mock('@/lib/apiClient', () => ({
  request: jest.fn(),
  apiClient: { request: jest.fn() },
  getApiBaseUrl: () => 'http://localhost:8000/api/v1',
}));

import { request } from '@/lib/apiClient';
const mockRequest = request as jest.MockedFunction<typeof request>;

describe('Search API', () => {
  afterEach(() => jest.clearAllMocks());

  describe('semanticSearch', () => {
    it('calls GET /search/semantic with query', async () => {
      const response = {
        query: 'login flow',
        search_type: 'semantic',
        total_results: 1,
        results: [{
          type: 'recording',
          recording_id: '1',
          name: 'Login Process',
          score: 0.95,
          matching_steps: [],
        }],
      };
      mockRequest.mockResolvedValueOnce(response);

      const result = await searchApi.semanticSearch('login flow');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/search/semantic',
        params: { q: 'login flow', limit: 10 },
      });
      expect(result.total_results).toBe(1);
    });

    it('passes project_id filter', async () => {
      mockRequest.mockResolvedValueOnce({ results: [], total_results: 0 });

      await searchApi.semanticSearch('test', 'proj-1', 5);
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/search/semantic',
        params: { q: 'test', limit: 5, project_id: 'proj-1' },
      });
    });
  });

  describe('reindexEmbeddings', () => {
    it('calls POST /search/reindex', async () => {
      const response = { status: 'ok', embeddings_created: 42, message: 'Done' };
      mockRequest.mockResolvedValueOnce(response);

      const result = await searchApi.reindexEmbeddings();
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/search/reindex',
        params: {},
      });
      expect(result.embeddings_created).toBe(42);
    });

    it('passes project_id for scoped reindex', async () => {
      mockRequest.mockResolvedValueOnce({ status: 'ok', embeddings_created: 5 });

      await searchApi.reindexEmbeddings('proj-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/search/reindex',
        params: { project_id: 'proj-1' },
      });
    });
  });
});
