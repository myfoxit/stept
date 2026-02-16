import * as linksApi from '../links';

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

describe('Links API', () => {
  afterEach(() => jest.clearAllMocks());

  describe('listLinks', () => {
    it('calls GET /links with project_id', async () => {
      const links = [{ id: 'link-1', source_type: 'document', target_type: 'knowledge' }];
      mockRequest.mockResolvedValueOnce(links);

      const result = await linksApi.listLinks('proj-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/links',
        params: { project_id: 'proj-1', resource_type: undefined, resource_id: undefined },
      });
      expect(result).toEqual(links);
    });

    it('supports resource filtering', async () => {
      mockRequest.mockResolvedValueOnce([]);

      await linksApi.listLinks('proj-1', 'document', 'doc-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/links',
        params: { project_id: 'proj-1', resource_type: 'document', resource_id: 'doc-1' },
      });
    });
  });

  describe('createLink', () => {
    it('calls POST /links with payload', async () => {
      const link = { id: 'link-1', project_id: 'proj-1', source_type: 'document', source_id: 'doc-1', target_type: 'knowledge', target_id: 'ks-1' };
      mockRequest.mockResolvedValueOnce(link);

      const payload = {
        project_id: 'proj-1',
        source_type: 'document',
        source_id: 'doc-1',
        target_type: 'knowledge',
        target_id: 'ks-1',
        link_type: 'related',
      };
      const result = await linksApi.createLink(payload);
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/links',
        data: payload,
      });
      expect(result).toEqual(link);
    });
  });

  describe('deleteLink', () => {
    it('calls DELETE /links/{linkId} with project_id', async () => {
      mockRequest.mockResolvedValueOnce({ ok: true });

      const result = await linksApi.deleteLink('link-1', 'proj-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'DELETE',
        url: '/links/link-1',
        params: { project_id: 'proj-1' },
      });
      expect(result).toEqual({ ok: true });
    });
  });

  describe('detectLinks', () => {
    it('calls POST /links/detect with params', async () => {
      const detected = [{ target_id: 'ks-2', confidence: 0.92 }];
      mockRequest.mockResolvedValueOnce(detected);

      const result = await linksApi.detectLinks('proj-1', 'document', 'doc-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/links/detect',
        params: { project_id: 'proj-1', resource_type: 'document', resource_id: 'doc-1', threshold: 0.8 },
      });
      expect(result).toEqual(detected);
    });

    it('supports custom threshold', async () => {
      mockRequest.mockResolvedValueOnce([]);

      await linksApi.detectLinks('proj-1', 'document', 'doc-1', 0.95);
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/links/detect',
        params: { project_id: 'proj-1', resource_type: 'document', resource_id: 'doc-1', threshold: 0.95 },
      });
    });
  });

  describe('getKnowledgeGraph', () => {
    it('calls GET /links/graph', async () => {
      const graph = {
        nodes: [{ id: 'document:doc-1', type: 'document', resource_id: 'doc-1' }],
        edges: [{ id: 'link-1', source: 'document:doc-1', target: 'knowledge:ks-1', link_type: 'related', confidence: null, auto_detected: false }],
      };
      mockRequest.mockResolvedValueOnce(graph);

      const result = await linksApi.getKnowledgeGraph('proj-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/links/graph',
        params: { project_id: 'proj-1' },
      });
      expect(result).toEqual(graph);
    });
  });

  describe('error handling', () => {
    it('propagates errors from request', async () => {
      mockRequest.mockRejectedValueOnce(new Error('Not found'));

      await expect(linksApi.deleteLink('bad-id', 'proj-1')).rejects.toThrow('Not found');
    });
  });
});
