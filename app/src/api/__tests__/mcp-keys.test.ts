import { apiClient } from '@/lib/apiClient';
import * as mcpKeysApi from '../mcp-keys';

jest.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('MCP Keys API', () => {
  afterEach(() => jest.clearAllMocks());

  it('lists MCP keys for a project', async () => {
    const keys: mcpKeysApi.McpApiKey[] = [
      {
        id: 'k1',
        project_id: 'p1',
        name: 'Main key',
        key_prefix: 'sk_test',
        created_at: '2026-01-01T00:00:00Z',
        last_used_at: null,
        is_active: true,
      },
    ];
    mockApiClient.get.mockResolvedValueOnce({ data: keys } as never);

    const result = await mcpKeysApi.listMcpKeys('p1');
    expect(mockApiClient.get).toHaveBeenCalledWith('/projects/p1/mcp-keys');
    expect(result).toEqual(keys);
  });

  it('creates an MCP key', async () => {
    const created: mcpKeysApi.McpApiKeyCreated = {
      id: 'k2',
      project_id: 'p1',
      name: 'New key',
      key_prefix: 'sk_live',
      raw_key: 'sk_live_xxx',
      created_at: '2026-01-01T00:00:00Z',
      last_used_at: null,
      is_active: true,
    };
    mockApiClient.post.mockResolvedValueOnce({ data: created } as never);

    const result = await mcpKeysApi.createMcpKey('p1', 'New key');
    expect(mockApiClient.post).toHaveBeenCalledWith('/projects/p1/mcp-keys', {
      name: 'New key',
    });
    expect(result.raw_key).toBe('sk_live_xxx');
  });

  it('revokes an MCP key', async () => {
    mockApiClient.delete.mockResolvedValueOnce({} as never);

    await mcpKeysApi.revokeMcpKey('p1', 'k1');
    expect(mockApiClient.delete).toHaveBeenCalledWith('/projects/p1/mcp-keys/k1');
  });
});
