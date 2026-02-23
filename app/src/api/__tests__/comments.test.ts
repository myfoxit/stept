import { apiClient } from '@/lib/apiClient';
import {
  createComment,
  deleteComment,
  listComments,
  toggleResolveComment,
  updateComment,
} from '../comments';

jest.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('comments API', () => {
  afterEach(() => jest.clearAllMocks());

  it('lists comments', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: [] } as never);
    await listComments('p1', 'workflow', 'w1');
    expect(mockApiClient.get).toHaveBeenCalledWith(
      '/comments?project_id=p1&resource_type=workflow&resource_id=w1',
    );
  });

  it.each(['workflow', 'document'])('creates %s comment', async (resourceType) => {
    mockApiClient.post.mockResolvedValueOnce({
      data: {
        id: 'c1',
        project_id: 'p1',
        user_id: 'u1',
        resource_type: resourceType,
        resource_id: 'r1',
        parent_id: null,
        content: 'Hi',
        resolved: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        user_display_name: 'User',
        user_email: 'u@example.com',
      },
    } as never);

    const res = await createComment('p1', {
      resource_type: resourceType,
      resource_id: 'r1',
      content: 'Hi',
    });
    expect(mockApiClient.post).toHaveBeenCalledWith('/comments?project_id=p1', {
      resource_type: resourceType,
      resource_id: 'r1',
      content: 'Hi',
    });
    expect(res.resource_type).toBe(resourceType);
  });

  it('updates comment', async () => {
    mockApiClient.put.mockResolvedValueOnce({ data: { id: 'c1', content: 'Updated' } } as never);
    const res = await updateComment('c1', 'Updated');
    expect(mockApiClient.put).toHaveBeenCalledWith('/comments/c1', { content: 'Updated' });
    expect(res.content).toBe('Updated');
  });

  it('toggles comment resolved', async () => {
    mockApiClient.patch.mockResolvedValueOnce({ data: { id: 'c1', resolved: true } } as never);
    const res = await toggleResolveComment('c1');
    expect(mockApiClient.patch).toHaveBeenCalledWith('/comments/c1/resolve');
    expect(res.resolved).toBe(true);
  });

  it('deletes comment', async () => {
    mockApiClient.delete.mockResolvedValueOnce({} as never);
    await deleteComment('c1');
    expect(mockApiClient.delete).toHaveBeenCalledWith('/comments/c1');
  });
});
