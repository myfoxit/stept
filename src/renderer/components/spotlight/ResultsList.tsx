import React from 'react';
import { Search, FileText, ListChecks, ExternalLink } from 'lucide-react';
import { formatRelativeTime, groupResults } from './helpers';
import type { SpotlightResult } from './types';

// --- ResultItem ---------------------------------------------------------------

const ResultItem: React.FC<{
  result: SpotlightResult;
  isHighlighted: boolean;
  onClick: () => void;
}> = ({ result, isHighlighted, onClick }) => {
  const rType = result.type || result.resource_type;
  const isWorkflow = rType === 'workflow';
  const meta: string[] = [];
  if (result.step_count) meta.push(`${result.step_count} steps`);
  if (result.word_count) meta.push(`${result.word_count} words`);
  if (result.updated_at) meta.push(formatRelativeTime(result.updated_at));

  return (
    <div
      data-result-item
      onClick={onClick}
      className={`result-item${isHighlighted ? ' result-item--active' : ''}`}
    >
      <div
        className={`result-icon ${isWorkflow ? 'result-icon--workflow' : 'result-icon--page'}`}
      >
        {isWorkflow ? (
          <ListChecks size={14} strokeWidth={2} />
        ) : (
          <FileText size={14} strokeWidth={2} />
        )}
      </div>
      <div className="result-info">
        <div className="result-name">
          {result.name || result.resource_name || 'Untitled'}
        </div>
        <div className="result-meta">{meta.join(' \u00b7 ')}</div>
      </div>
      {isHighlighted && (
        <ExternalLink size={14} strokeWidth={2} className="result-ext-icon" />
      )}
    </div>
  );
};

// --- SectionLabel -------------------------------------------------------------

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="section-label">{children}</div>
);

// --- ResultsList --------------------------------------------------------------

interface ResultsListProps {
  query: string;
  results: SpotlightResult[];
  contextResults: SpotlightResult[];
  highlightIndex: number;
  isSearching: boolean;
  resultsRef: React.Ref<HTMLDivElement>;
  onHighlight: (index: number) => void;
  onOpen: (result: SpotlightResult) => void;
}

export const ResultsList: React.FC<ResultsListProps> = ({
  query,
  results,
  contextResults,
  highlightIndex,
  isSearching,
  resultsRef,
  onHighlight,
  onOpen,
}) => {
  const grouped = groupResults(query.trim() ? results : []);

  return (
    <div ref={resultsRef} className="content-area scrollbar-thin">
      {/* Context results (when no query) */}
      {!query.trim() && contextResults.length > 0 && (
        <div>
          <SectionLabel>Suggested</SectionLabel>
          {contextResults.map((result, idx) => (
            <ResultItem
              key={result.id}
              result={result}
              isHighlighted={idx === highlightIndex}
              onClick={() => onOpen(result)}
            />
          ))}
        </div>
      )}

      {/* Searching spinner */}
      {isSearching && results.length === 0 && (
        <div className="empty-state">Searching...</div>
      )}

      {/* No results */}
      {!isSearching && query.trim() && results.length === 0 && (
        <div className="empty-state">No results for &ldquo;{query}&rdquo;</div>
      )}

      {/* Empty state — no query, no context */}
      {!query.trim() && contextResults.length === 0 && (
        <div className="empty-hero">
          <div className="empty-hero-icon">
            <Search size={24} strokeWidth={2} />
          </div>
          <span className="empty-hero-text">Start typing to search</span>
        </div>
      )}

      {/* Grouped search results */}
      {(() => {
        const offset = !query.trim() ? contextResults.length : 0;
        let globalIndex = offset;
        return Object.entries(grouped).map(([label, items]) => (
          <div key={label}>
            <SectionLabel>{label}</SectionLabel>
            {items.map((result) => {
              const idx = globalIndex++;
              return (
                <ResultItem
                  key={result.id}
                  result={result}
                  isHighlighted={idx === highlightIndex}
                  onClick={() => onOpen(result)}
                />
              );
            })}
          </div>
        ));
      })()}
    </div>
  );
};
