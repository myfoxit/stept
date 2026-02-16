import * as knowledgeApi from '../knowledge';

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

describe('Knowledge API', () => {
  afterEach(() => jest.clearAllMocks());

  describe('uploadKnowledgeSource', () => {
    it('calls POST /knowledge/upload with FormData', async () => {
      const source = { id: 'ks-1', name: 'test.pdf', source_type: 'upload' };
      mockRequest.mockResolvedValueOnce(source);

      const file = new File(['hello'], 'test.pdf', { type: 'application/pdf' });
      const result = await knowledgeApi.uploadKnowledgeSource(file, 'proj-1');

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/knowledge/upload',
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      );
      const callData = mockRequest.mock.calls[0][0].data as FormData;
      expect(callData.get('project_id')).toBe('proj-1');
      expect(result).toEqual(source);
    });
  });

  describe('listKnowledgeSources', () => {
    it('calls GET /knowledge/sources with project_id', async () => {
      const sources = [{ id: 'ks-1', name: 'file.pdf' }];
      mockRequest.mockResolvedValueOnce(sources);

      const result = await knowledgeApi.listKnowledgeSources('proj-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/knowledge/sources',
        params: { project_id: 'proj-1' },
      });
      expect(result).toEqual(sources);
    });
  });

  describe('getKnowledgeSource', () => {
    it('calls GET /knowledge/sources/{sourceId}', async () => {
      const source = { id: 'ks-1', name: 'file.pdf', raw_content: 'hello' };
      mockRequest.mockResolvedValueOnce(source);

      const result = await knowledgeApi.getKnowledgeSource('ks-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/knowledge/sources/ks-1',
      });
      expect(result).toEqual(source);
    });
  });

  describe('deleteKnowledgeSource', () => {
    it('calls DELETE /knowledge/sources/{sourceId}', async () => {
      mockRequest.mockResolvedValueOnce({ deleted: true });

      const result = await knowledgeApi.deleteKnowledgeSource('ks-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'DELETE',
        url: '/knowledge/sources/ks-1',
      });
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('reindexKnowledgeSource', () => {
    it('calls POST /knowledge/reindex/{sourceId}', async () => {
      mockRequest.mockResolvedValueOnce({ reindexed: true, embeddings_created: 42 });

      const result = await knowledgeApi.reindexKnowledgeSource('ks-1');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/knowledge/reindex/ks-1',
      });
      expect(result).toEqual({ reindexed: true, embeddings_created: 42 });
    });
  });

  describe('error handling', () => {
    it('propagates errors from request', async () => {
      mockRequest.mockRejectedValueOnce(new Error('Network error'));

      await expect(knowledgeApi.listKnowledgeSources('proj-1')).rejects.toThrow('Network error');
    });
  });
});
