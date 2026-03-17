// Direct port of search.js — Search API client for the Stept Chrome Extension.

export async function searchRecordings(
  apiUrl: string,
  accessToken: string,
  query: string,
  projectId: string | null,
  limit: number = 10,
): Promise<{ total_results: number; results: any[] }> {
  const params = new URLSearchParams({
    q: query,
    limit: limit.toString(),
  });
  if (projectId) {
    params.append('project_id', projectId);
  }

  const response = await fetch(`${apiUrl}/search/search?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }

  return response.json();
}
