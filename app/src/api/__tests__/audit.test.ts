import * as auditApi from '../audit';

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

describe('Audit API', () => {
  afterEach(() => jest.clearAllMocks());

  describe('getAuditLogs', () => {
    it('calls GET /audit/logs with params', async () => {
      const logs = [{ id: 'log-1', action: 'create', user_id: 'u1' }];
      mockRequest.mockResolvedValueOnce(logs);

      const result = await auditApi.getAuditLogs({ project_id: 'proj-1' });
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/audit/logs',
        params: { project_id: 'proj-1' },
      });
      expect(result).toEqual(logs);
    });

    it('passes optional filter params', async () => {
      mockRequest.mockResolvedValueOnce([]);

      await auditApi.getAuditLogs({
        project_id: 'proj-1',
        action: 'delete',
        resource_type: 'document',
        limit: 10,
        offset: 20,
      });
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/audit/logs',
        params: {
          project_id: 'proj-1',
          action: 'delete',
          resource_type: 'document',
          limit: 10,
          offset: 20,
        },
      });
    });
  });

  describe('exportAuditLogs', () => {
    it('calls GET /audit/logs/export with blob responseType', async () => {
      const blob = new Blob(['csv,data']);
      mockRequest.mockResolvedValueOnce(blob);

      const result = await auditApi.exportAuditLogs({ project_id: 'proj-1' });
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/audit/logs/export',
        params: { project_id: 'proj-1' },
        responseType: 'blob',
      });
      expect(result).toEqual(blob);
    });
  });

  describe('getAuditStats', () => {
    it('calls GET /audit/logs/stats', async () => {
      const stats = { create: 10, delete: 3 };
      mockRequest.mockResolvedValueOnce(stats);

      const result = await auditApi.getAuditStats({ project_id: 'proj-1' });
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/audit/logs/stats',
        params: { project_id: 'proj-1' },
      });
      expect(result).toEqual(stats);
    });

    it('passes date range params', async () => {
      mockRequest.mockResolvedValueOnce({});

      await auditApi.getAuditStats({
        project_id: 'proj-1',
        from_date: '2024-01-01',
        to_date: '2024-12-31',
      });
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/audit/logs/stats',
        params: {
          project_id: 'proj-1',
          from_date: '2024-01-01',
          to_date: '2024-12-31',
        },
      });
    });
  });

  describe('error handling', () => {
    it('propagates errors from request', async () => {
      mockRequest.mockRejectedValueOnce(new Error('Forbidden'));

      await expect(auditApi.getAuditLogs({ project_id: 'proj-1' })).rejects.toThrow('Forbidden');
    });
  });
});
