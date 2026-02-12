import { apiClient } from '@/lib/apiClient';
import * as foldersApi from '../folders';

jest.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('Folders API', () => {
  afterEach(() => jest.clearAllMocks());

  describe('getFolderTree', () => {
    it('fetches folder tree for a project', async () => {
      const tree = [{ id: '1', name: 'Root', children: [] }];
      mockApiClient.get.mockResolvedValueOnce({ data: tree });

      const result = await foldersApi.getFolderTree('proj-1');
      expect(mockApiClient.get).toHaveBeenCalledWith('/folders/tree', {
        params: { project_id: 'proj-1' },
      });
      expect(result).toEqual(tree);
    });

    it('passes is_private filter', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: [] });

      await foldersApi.getFolderTree('proj-1', true);
      expect(mockApiClient.get).toHaveBeenCalledWith('/folders/tree', {
        params: { project_id: 'proj-1', is_private: 'true' },
      });
    });
  });

  describe('createFolder', () => {
    it('creates a folder', async () => {
      const folder = { id: '2', name: 'New Folder' };
      mockApiClient.post.mockResolvedValueOnce({ data: folder });

      const result = await foldersApi.createFolder({
        name: 'New Folder',
        project_id: 'proj-1',
      });
      expect(mockApiClient.post).toHaveBeenCalledWith('/folders/', {
        name: 'New Folder',
        project_id: 'proj-1',
      });
      expect(result).toEqual(folder);
    });

    it('supports parent_id for nesting', async () => {
      mockApiClient.post.mockResolvedValueOnce({ data: { id: '3' } });

      await foldersApi.createFolder({
        name: 'Child',
        project_id: 'proj-1',
        parent_id: 'parent-1',
      });
      expect(mockApiClient.post).toHaveBeenCalledWith('/folders/', {
        name: 'Child',
        project_id: 'proj-1',
        parent_id: 'parent-1',
      });
    });
  });

  describe('updateFolder', () => {
    it('updates folder name', async () => {
      mockApiClient.put.mockResolvedValueOnce({ data: { id: '1', name: 'Renamed' } });

      const result = await foldersApi.updateFolder('1', { name: 'Renamed' });
      expect(mockApiClient.put).toHaveBeenCalledWith('/folders/1', { name: 'Renamed' });
      expect(result.name).toBe('Renamed');
    });
  });

  describe('moveFolder', () => {
    it('moves folder to new parent', async () => {
      mockApiClient.put.mockResolvedValueOnce({ data: { id: '1' } });

      await foldersApi.moveFolder('1', 'parent-2', 0);
      expect(mockApiClient.put).toHaveBeenCalledWith('/folders/1/move', {
        parent_id: 'parent-2',
        position: 0,
        is_private: undefined,
      });
    });
  });

  describe('deleteFolder', () => {
    it('deletes a folder', async () => {
      mockApiClient.delete.mockResolvedValueOnce({});

      await foldersApi.deleteFolder('1');
      expect(mockApiClient.delete).toHaveBeenCalledWith('/folders/1');
    });
  });

  describe('duplicateFolder', () => {
    it('duplicates without children by default', async () => {
      mockApiClient.post.mockResolvedValueOnce({ data: { id: '2' } });

      await foldersApi.duplicateFolder('1');
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/folders/1/duplicate?include_children=false'
      );
    });

    it('duplicates with children', async () => {
      mockApiClient.post.mockResolvedValueOnce({ data: { id: '2' } });

      await foldersApi.duplicateFolder('1', true);
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/folders/1/duplicate?include_children=true'
      );
    });
  });

  describe('toggleFolderExpansion', () => {
    it('toggles expansion state', async () => {
      mockApiClient.patch.mockResolvedValueOnce({
        data: { id: '1', is_expanded: true },
      });

      const result = await foldersApi.toggleFolderExpansion('1', true);
      expect(mockApiClient.patch).toHaveBeenCalledWith(
        '/folders/1/expand?is_expanded=true'
      );
      expect(result.is_expanded).toBe(true);
    });
  });
});
