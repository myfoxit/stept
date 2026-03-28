import { describe, expect, it, vi, afterEach } from 'vitest';

import { searchRecordings } from './search';

describe('searchRecordings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the search URL with project and limit parameters', async () => {
    const json = vi.fn().mockResolvedValue({ total_results: 1, results: [{ id: 'rec-1' }] });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json });
    vi.stubGlobal('fetch', fetchMock);

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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ total_results: 0, results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchRecordings('https://api.stept.test/api/v1', 'token-123', 'analytics', null);

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.stept.test/api/v1/search/search?q=analytics&limit=10');
  });

  it('throws a status-rich error when the backend rejects the query', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(
      searchRecordings('https://api.stept.test/api/v1', 'token-123', 'dashboard', 'project-1'),
    ).rejects.toThrow('Search failed: 503');
  });
});
