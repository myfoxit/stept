import React, { useState, useRef, useCallback } from 'react';
import { sendToBackground } from '@/shared/messages';

interface SearchBarProps {
  selectedProjectId: string;
}

interface SearchResult {
  name?: string;
  generated_title?: string;
  snippet?: string;
  summary?: string;
  created_at?: string;
  recording_id?: string;
  id?: string;
}

export default function SearchBar({ selectedProjectId }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const debounceRef = useRef<number>(0);
  const [webAppUrl, setWebAppUrl] = useState('');

  const performSearch = useCallback(
    async (q: string) => {
      try {
        const settings = await sendToBackground<any>({ type: 'GET_SETTINGS' });
        const state = await sendToBackground<any>({ type: 'GET_STATE' });
        if (!state.isAuthenticated) return;

        const params = new URLSearchParams({ q, limit: '10' });
        if (selectedProjectId) params.append('project_id', selectedProjectId);

        const data = await sendToBackground<any>({
          type: 'API_FETCH',
          url: `${settings.apiBaseUrl}/search/search?${params}`,
        });

        setShowSpinner(false);

        if (!data) {
          setSearchFailed(true);
          setShowResults(true);
          return;
        }

        const frontendUrl =
          settings.frontendUrl ||
          settings.apiBaseUrl.replace('/api/v1', '');
        setWebAppUrl(frontendUrl);

        const items = data.results || [];
        setResults(items);
        setNoResults(items.length === 0);
        setSearchFailed(false);
        setShowResults(true);
      } catch {
        setShowSpinner(false);
        setSearchFailed(true);
        setShowResults(true);
      }
    },
    [selectedProjectId],
  );

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = val.trim();
    if (trimmed.length === 0) {
      setShowResults(false);
      setShowSpinner(false);
      return;
    }

    setShowSpinner(true);
    debounceRef.current = window.setTimeout(() => performSearch(trimmed), 300);
  };

  const handleResultClick = (id: string) => {
    chrome.tabs.create({ url: `${webAppUrl}/workflow/${id}` });
  };

  return (
    <div className="search-container" id="searchContainer">
      <div className="search-input-wrap">
        <svg
          className="search-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#A8A29E"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          id="searchInput"
          className="search-input"
          placeholder="Search recordings..."
          value={query}
          onChange={handleInput}
        />
        {showSpinner && (
          <div className="search-spinner" id="searchSpinner" />
        )}
      </div>

      {showResults && (
        <div className="search-results" id="searchResults">
          {searchFailed && (
            <div className="search-no-results">Search failed</div>
          )}
          {!searchFailed && noResults && (
            <div className="search-no-results">No results found</div>
          )}
          {!searchFailed &&
            results.map((r) => {
              const title = r.name || r.generated_title || 'Untitled';
              const snippet = r.snippet || r.summary || '';
              const date = r.created_at
                ? new Date(r.created_at).toLocaleDateString()
                : '';
              const id = r.recording_id || r.id || '';
              return (
                <div
                  key={id}
                  className="search-result-item"
                  data-url={`${webAppUrl}/workflow/${id}`}
                  onClick={() => handleResultClick(id)}
                >
                  <span className="search-result-title">{title}</span>
                  {snippet && (
                    <span className="search-result-snippet">{snippet}</span>
                  )}
                  {date && (
                    <span className="search-result-meta">{date}</span>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
