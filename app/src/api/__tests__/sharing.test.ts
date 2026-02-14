import { apiClient } from '@/lib/apiClient';
import * as sharingApi from '../sharing';

jest.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  },
  request: jest.fn(),
  getApiBaseUrl: () => 'http://localhost:8000/api/v1',
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('Sharing API', () => {
  afterEach(() => jest.clearAllMocks());

  describe('getShareSettings', () => {
    it('fetches document share settings', async () => {
      const settings: sharingApi.ShareSettings = {
        is_public: false,
        share_token: null,
        public_url: null,
        shared_with: [],
      };
      mockApiClient.get.mockResolvedValueOnce({ data: settings });

      const result = await sharingApi.getShareSettings('document', 'doc-1');
      expect(mockApiClient.get).toHaveBeenCalledWith('/documents/doc-1/share');
      expect(result).toEqual(settings);
    });

    it('fetches workflow share settings', async () => {
      const settings: sharingApi.ShareSettings = {
        is_public: true,
        share_token: 'abc123',
        public_url: '/public/workflow/abc123',
        shared_with: [],
      };
      mockApiClient.get.mockResolvedValueOnce({ data: settings });

      const result = await sharingApi.getShareSettings('workflow', 'wf-1');
      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/process-recording/workflow/wf-1/share',
      );
      expect(result).toEqual(settings);
    });
  });

  describe('togglePublicLink', () => {
    it('enables public link', async () => {
      const settings: sharingApi.ShareSettings = {
        is_public: true,
        share_token: 'token-123',
        public_url: '/public/document/token-123',
        shared_with: [],
      };
      mockApiClient.post.mockResolvedValueOnce({ data: settings });

      const result = await sharingApi.togglePublicLink('document', 'doc-1', true);
      expect(mockApiClient.post).toHaveBeenCalledWith('/documents/doc-1/share/public');
      expect(result.is_public).toBe(true);
      expect(result.share_token).toBe('token-123');
    });

    it('disables public link', async () => {
      const settings: sharingApi.ShareSettings = {
        is_public: false,
        share_token: 'token-123',
        public_url: null,
        shared_with: [],
      };
      mockApiClient.delete.mockResolvedValueOnce({ data: settings });

      const result = await sharingApi.togglePublicLink('document', 'doc-1', false);
      expect(mockApiClient.delete).toHaveBeenCalledWith('/documents/doc-1/share/public');
      expect(result.is_public).toBe(false);
    });
  });

  describe('inviteUser', () => {
    it('invites a user by email', async () => {
      const shared: sharingApi.SharedUser = {
        id: 'share-1',
        email: 'bob@example.com',
        permission: 'view',
        user_name: 'Bob',
      };
      mockApiClient.post.mockResolvedValueOnce({ data: shared });

      const result = await sharingApi.inviteUser('document', 'doc-1', 'bob@example.com', 'view');
      expect(mockApiClient.post).toHaveBeenCalledWith('/documents/doc-1/share/invite', {
        email: 'bob@example.com',
        permission: 'view',
      });
      expect(result).toEqual(shared);
    });
  });

  describe('removeInvite', () => {
    it('removes an invite', async () => {
      mockApiClient.delete.mockResolvedValueOnce({ data: null });

      await sharingApi.removeInvite('document', 'doc-1', 'share-1');
      expect(mockApiClient.delete).toHaveBeenCalledWith(
        '/documents/doc-1/share/invite/share-1',
      );
    });
  });

  describe('updateInvitePermission', () => {
    it('updates permission', async () => {
      mockApiClient.patch.mockResolvedValueOnce({ data: null });

      await sharingApi.updateInvitePermission('document', 'doc-1', 'share-1', 'edit');
      expect(mockApiClient.patch).toHaveBeenCalledWith(
        '/documents/doc-1/share/invite/share-1',
        { permission: 'edit' },
      );
    });
  });

  describe('getSharedWithMe', () => {
    it('fetches shared resources', async () => {
      const response: sharingApi.SharedWithMeResponse = {
        items: [
          {
            id: 'rs-1',
            resource_type: 'document',
            resource_id: 'doc-1',
            permission: 'view',
            shared_by_name: 'Alice',
            shared_at: '2026-01-01T00:00:00Z',
            resource: {
              id: 'doc-1',
              name: 'Shared Doc',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          },
        ],
      };
      mockApiClient.get.mockResolvedValueOnce({ data: response });

      const result = await sharingApi.getSharedWithMe();
      expect(mockApiClient.get).toHaveBeenCalledWith('/shared-with-me');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].resource.name).toBe('Shared Doc');
    });

    it('returns empty list when nothing shared', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: { items: [] } });

      const result = await sharingApi.getSharedWithMe();
      expect(result.items).toHaveLength(0);
    });
  });
});
