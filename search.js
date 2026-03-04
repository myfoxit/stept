/**
 * Search API client for the Ondoki Chrome Extension.
 * Provides search functionality against the backend API.
 */

/**
 * Search recordings via the backend API.
 * @param {string} apiUrl - Base API URL
 * @param {string} accessToken - Auth token
 * @param {string} query - Search query
 * @param {string} projectId - Project ID to scope search
 * @param {number} limit - Max results (default 10)
 * @returns {Promise<{total_results: number, results: Array}>}
 */
async function searchRecordings(apiUrl, accessToken, query, projectId, limit = 10) {
  const params = new URLSearchParams({
    q: query,
    limit: limit.toString(),
  });
  if (projectId) {
    params.append('project_id', projectId);
  }

  const response = await fetch(`${apiUrl}/search?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }

  return response.json();
}
