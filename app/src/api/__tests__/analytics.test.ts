import * as analyticsApi from '../analytics';

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

describe('Analytics API', () => {
  afterEach(() => jest.clearAllMocks());

  describe('getTopAccessed', () => {
    it('calls GET /analytics/top-accessed with defaults', async () => {
      const data = [{ resource_id: 'r1', count: 42 }];
      mockRequest.mockResolvedValueOnce(data);

      const result = await analyticsApi.getTopAccessed('proj-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/analytics/top-accessed',
        params: { project_id: 'proj-1', days: 30, limit: 10 },
      });
      expect(result).toEqual(data);
    });

    it('supports custom days and limit', async () => {
      mockRequest.mockResolvedValueOnce([]);

      await analyticsApi.getTopAccessed('proj-1', 7, 5);
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/analytics/top-accessed',
        params: { project_id: 'proj-1', days: 7, limit: 5 },
      });
    });
  });

  describe('getAccessByChannel', () => {
    it('calls GET /analytics/access-by-channel', async () => {
      const data = [{ channel: 'web', count: 100 }];
      mockRequest.mockResolvedValueOnce(data);

      const result = await analyticsApi.getAccessByChannel('proj-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/analytics/access-by-channel',
        params: { project_id: 'proj-1', days: 30 },
      });
      expect(result).toEqual(data);
    });
  });

  describe('getStaleResources', () => {
    it('calls GET /analytics/stale with default 90 days', async () => {
      mockRequest.mockResolvedValueOnce([]);

      await analyticsApi.getStaleResources('proj-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/analytics/stale',
        params: { project_id: 'proj-1', days: 90 },
      });
    });

    it('supports custom days', async () => {
      mockRequest.mockResolvedValueOnce([]);

      await analyticsApi.getStaleResources('proj-1', 180);
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/analytics/stale',
        params: { project_id: 'proj-1', days: 180 },
      });
    });
  });

  describe('getQueryLog', () => {
    it('calls GET /analytics/queries with defaults', async () => {
      const queries = [{ query: 'how to', count: 5 }];
      mockRequest.mockResolvedValueOnce(queries);

      const result = await analyticsApi.getQueryLog('proj-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/analytics/queries',
        params: { project_id: 'proj-1', days: 30, limit: 50 },
      });
      expect(result).toEqual(queries);
    });
  });

  describe('getKnowledgeGaps', () => {
    it('calls GET /analytics/gaps', async () => {
      const gaps = [{ topic: 'onboarding', frequency: 12 }];
      mockRequest.mockResolvedValueOnce(gaps);

      const result = await analyticsApi.getKnowledgeGaps('proj-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/analytics/gaps',
        params: { project_id: 'proj-1', days: 30 },
      });
      expect(result).toEqual(gaps);
    });
  });

  describe('error handling', () => {
    it('propagates errors from request', async () => {
      mockRequest.mockRejectedValueOnce(new Error('Unauthorized'));

      await expect(analyticsApi.getTopAccessed('proj-1')).rejects.toThrow('Unauthorized');
    });
  });
});
