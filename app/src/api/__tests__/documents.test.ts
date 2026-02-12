import { apiClient } from '@/lib/apiClient';
import * as documentsApi from '../documents';

jest.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
  request: jest.fn(),
  getApiBaseUrl: () => 'http://localhost:8000/api/v1',
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('Documents API', () => {
  afterEach(() => jest.clearAllMocks());

  describe('getDocument', () => {
    it('fetches a document by id', async () => {
      const doc = { id: 'doc-1', name: 'My Doc', content: {}, project_id: 'proj-1' };
      mockApiClient.get.mockResolvedValueOnce({ data: doc });

      const result = await documentsApi.getDocument('doc-1');
      expect(mockApiClient.get).toHaveBeenCalledWith('/documents/doc-1');
      expect(result).toEqual(doc);
    });
  });

  describe('createDocument', () => {
    it('creates a new document', async () => {
      const newDoc = { id: 'doc-2', name: 'New Doc', project_id: 'proj-1' };
      mockApiClient.post.mockResolvedValueOnce({ data: newDoc });

      const result = await documentsApi.createDocument({
        name: 'New Doc',
        project_id: 'proj-1',
        content: { type: 'doc', content: [] },
      });
      expect(mockApiClient.post).toHaveBeenCalledWith('/documents/', {
        name: 'New Doc',
        project_id: 'proj-1',
        content: { type: 'doc', content: [] },
      });
      expect(result).toEqual(newDoc);
    });

    it('supports optional folder_id', async () => {
      mockApiClient.post.mockResolvedValueOnce({ data: { id: 'doc-3' } });

      await documentsApi.createDocument({
        name: 'Folder Doc',
        project_id: 'proj-1',
        folder_id: 'folder-1',
      });
      expect(mockApiClient.post).toHaveBeenCalledWith('/documents/', expect.objectContaining({
        folder_id: 'folder-1',
      }));
    });

    it('supports is_private flag', async () => {
      mockApiClient.post.mockResolvedValueOnce({ data: { id: 'doc-4' } });

      await documentsApi.createDocument({
        name: 'Private Doc',
        project_id: 'proj-1',
        is_private: true,
      });
      expect(mockApiClient.post).toHaveBeenCalledWith('/documents/', expect.objectContaining({
        is_private: true,
      }));
    });
  });

  describe('saveDocument', () => {
    it('updates a document', async () => {
      const updated = { id: 'doc-1', name: 'Updated' };
      mockApiClient.put.mockResolvedValueOnce({ data: updated });

      const result = await documentsApi.saveDocument('doc-1', { name: 'Updated' });
      expect(mockApiClient.put).toHaveBeenCalledWith('/documents/doc-1', { name: 'Updated' });
      expect(result).toEqual(updated);
    });
  });

  describe('deleteDocument', () => {
    it('deletes a document', async () => {
      mockApiClient.delete.mockResolvedValueOnce({});

      await documentsApi.deleteDocument('doc-1');
      expect(mockApiClient.delete).toHaveBeenCalledWith('/documents/doc-1');
    });
  });

  describe('listDocuments', () => {
    it('lists all documents', async () => {
      const docs = [
        { id: 'doc-1', name: 'Doc A' },
        { id: 'doc-2', name: 'Doc B' },
      ];
      mockApiClient.get.mockResolvedValueOnce({ data: docs });

      const result = await documentsApi.listDocuments();
      expect(mockApiClient.get).toHaveBeenCalledWith('/documents/');
      expect(result).toEqual(docs);
    });
  });

  describe('getFilteredDocuments', () => {
    it('fetches filtered documents with default sort', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: [] });

      await documentsApi.getFilteredDocuments('proj-1');
      expect(mockApiClient.get).toHaveBeenCalledWith('/documents/filtered', {
        params: {
          project_id: 'proj-1',
          sort_by: 'created_at',
          sort_order: 'desc',
        },
      });
    });

    it('passes folder_id filter when provided', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: [] });

      await documentsApi.getFilteredDocuments('proj-1', 'folder-1');
      expect(mockApiClient.get).toHaveBeenCalledWith('/documents/filtered', {
        params: expect.objectContaining({
          folder_id: 'folder-1',
        }),
      });
    });

    it('passes custom sort params', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: [] });

      await documentsApi.getFilteredDocuments('proj-1', undefined, 'name', 'asc');
      expect(mockApiClient.get).toHaveBeenCalledWith('/documents/filtered', {
        params: {
          project_id: 'proj-1',
          sort_by: 'name',
          sort_order: 'asc',
        },
      });
    });
  });

  describe('moveDocument', () => {
    it('moves a document to a new folder', async () => {
      const moved = { id: 'doc-1', folder_id: 'folder-2' };
      mockApiClient.put.mockResolvedValueOnce({ data: moved });

      const result = await documentsApi.moveDocument('doc-1', 'folder-2', 0);
      expect(mockApiClient.put).toHaveBeenCalledWith('/documents/doc-1/move', {
        parent_id: 'folder-2',
        position: 0,
        is_private: undefined,
      });
      expect(result).toEqual(moved);
    });

    it('moves a document to root (null parent)', async () => {
      mockApiClient.put.mockResolvedValueOnce({ data: { id: 'doc-1' } });

      await documentsApi.moveDocument('doc-1', null);
      expect(mockApiClient.put).toHaveBeenCalledWith('/documents/doc-1/move', {
        parent_id: null,
        position: undefined,
        is_private: undefined,
      });
    });
  });

  describe('duplicateDocument', () => {
    it('duplicates a document without children by default', async () => {
      const dup = { id: 'doc-copy', name: 'Copy of Doc' };
      mockApiClient.post.mockResolvedValueOnce({ data: dup });

      const result = await documentsApi.duplicateDocument('doc-1');
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/documents/doc-1/duplicate?include_children=false'
      );
      expect(result).toEqual(dup);
    });

    it('duplicates with children when requested', async () => {
      mockApiClient.post.mockResolvedValueOnce({ data: { id: 'doc-copy' } });

      await documentsApi.duplicateDocument('doc-1', true);
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/documents/doc-1/duplicate?include_children=true'
      );
    });
  });
});
