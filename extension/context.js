/**
 * Context Link matching for the Stept Chrome Extension.
 * Matches the current tab URL against context links configured in the web app.
 */

/**
 * Fetch context link matches for a given URL.
 * @param {string} apiUrl - Base API URL
 * @param {string} accessToken - Auth token
 * @param {string} tabUrl - Current tab URL to match against
 * @param {string} projectId - Project ID
 * @returns {Promise<{matches: Array}>}
 */
async function fetchContextMatches(apiUrl, accessToken, tabUrl, projectId) {
  const params = new URLSearchParams({
    url: tabUrl,
  });
  if (projectId) {
    params.append('project_id', projectId);
  }

  const response = await fetch(`${apiUrl}/context-links/match?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      // Endpoint not available yet — return empty
      return { matches: [] };
    }
    throw new Error(`Context match failed: ${response.status}`);
  }

  return response.json();
}
