import { apiClient } from '@/lib/apiClient';
import * as contextLinksApi from '../context-links';

jest.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('Context Links API', () => {
  afterEach(() => jest.clearAllMocks());

  it('lists context links with all filters', async () => {
    const links: contextLinksApi.ContextLink[] = [
      {
        id: 'l1',
        project_id: 'p1',
        match_type: 'url_pattern',
        match_value: 'github.com/*',
        resource_type: 'workflow',
        resource_id: 'w1',
        priority: 10,
      },
    ];
    mockApiClient.get.mockResolvedValueOnce({ data: links } as never);

    const result = await contextLinksApi.listContextLinks('p1', 'workflow', 'w1');
    expect(mockApiClient.get).toHaveBeenCalledWith(
      '/context-links?project_id=p1&resource_type=workflow&resource_id=w1',
    );
    expect(result).toEqual(links);
  });

  it('creates a context link', async () => {
    const payload = {
      project_id: 'p1',
      match_type: 'url_exact',
      match_value: 'https://example.com',
      resource_type: 'document',
      resource_id: 'd1',
      note: 'Exact match',
      priority: 5,
    };

    const created: contextLinksApi.ContextLink = {
      id: 'l2',
      ...payload,
    };

    mockApiClient.post.mockResolvedValueOnce({ data: created } as never);

    const result = await contextLinksApi.createContextLink(payload);
    expect(mockApiClient.post).toHaveBeenCalledWith('/context-links', payload);
    expect(result.id).toBe('l2');
  });

  it('deletes a context link', async () => {
    mockApiClient.delete.mockResolvedValueOnce({} as never);

    await contextLinksApi.deleteContextLink('l2');
    expect(mockApiClient.delete).toHaveBeenCalledWith('/context-links/l2');
  });
});
