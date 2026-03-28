import { searchRecordings } from './search';

describe('searchRecordings', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('builds the search URL with project and limit parameters', async () => {
    const json = jest.fn().mockResolvedValue({ total_results: 1, results: [{ id: 'rec-1' }] });
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json });
    (globalThis as any).fetch = fetchMock;

    const result = await searchRecordings(
      'https://api.stept.test/api/v1',
      'token-123',
      'release notes',
      'project-9',
      25,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.stept.test/api/v1/search/search?q=release+notes&limit=25&project_id=project-9',
      {
        headers: {
          Authorization: 'Bearer token-123',
        },
      },
    );
    expect(result).toEqual({ total_results: 1, results: [{ id: 'rec-1' }] });
  });

  it('omits project_id when no project is selected', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ total_results: 0, results: [] }),
    });
    (globalThis as any).fetch = fetchMock;

    await searchRecordings('https://api.stept.test/api/v1', 'token-123', 'analytics', null);

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.stept.test/api/v1/search/search?q=analytics&limit=10');
  });

  it('throws a status-rich error when the backend rejects the query', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

    await expect(
      searchRecordings('https://api.stept.test/api/v1', 'token-123', 'dashboard', 'project-1'),
    ).rejects.toThrow('Search failed: 503');
  });
});
