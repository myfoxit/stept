import React from 'react';
import { Search, FileText, ListChecks, ExternalLink } from 'lucide-react';
import { theme } from './theme';
import { formatRelativeTime, groupResults } from './helpers';
import type { SpotlightResult } from './types';

// ─── ResultItem ──────────────────────────────────────────────────────────────

const ResultItem: React.FC<{
  result: SpotlightResult;
  isHighlighted: boolean;
  onHover: () => void;
  onClick: () => void;
}> = ({ result, isHighlighted, onHover, onClick }) => {
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
      onMouseEnter={onHover}
      className="result-item"
      style={{
        background: isHighlighted ? 'rgba(26,26,26,0.06)' : 'transparent',
        boxShadow: isHighlighted
          ? 'inset 0 0 0 1.5px rgba(26,26,26,0.12)'
          : 'none',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          background: isWorkflow
            ? 'rgba(26,26,26,0.06)'
            : 'rgba(136,136,136,0.08)',
        }}
      >
        {isWorkflow ? (
          <ListChecks size={14} color={theme.dark} strokeWidth={2} />
        ) : (
          <FileText size={14} color="#888888" strokeWidth={2} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: theme.dark,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {result.name || result.resource_name || 'Untitled'}
        </div>
        <div
          style={{
            fontSize: 10,
            color: theme.textMuted,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {meta.join(' · ')}
        </div>
      </div>
      {isHighlighted && (
        <ExternalLink
          size={14}
          color={theme.textMuted}
          strokeWidth={2}
          style={{ flexShrink: 0 }}
        />
      )}
    </div>
  );
};

// ─── SectionLabel ────────────────────────────────────────────────────────────

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 10,
      fontWeight: 600,
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      padding: '6px 6px 4px',
    }}
  >
    {children}
  </div>
);

// ─── ResultsList ─────────────────────────────────────────────────────────────

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
    <div
      ref={resultsRef}
      className="content-area scrollbar-thin"
      style={{ maxHeight: 280, overflowY: 'auto', padding: '6px 10px' }}
    >
      {/* Context results (when no query) */}
      {!query.trim() && contextResults.length > 0 && (
        <div>
          <SectionLabel>Suggested</SectionLabel>
          {contextResults.map((result, idx) => (
            <ResultItem
              key={result.id}
              result={result}
              isHighlighted={idx === highlightIndex}
              onHover={() => onHighlight(idx)}
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
        <div
          style={{
            padding: '48px 8px 32px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'rgba(58,176,138,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Search size={24} color={theme.accent} strokeWidth={2} />
          </div>
          <span style={{ fontSize: 13, color: theme.textMuted, fontWeight: 500 }}>
            Start typing to search
          </span>
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
                  onHover={() => onHighlight(idx)}
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
