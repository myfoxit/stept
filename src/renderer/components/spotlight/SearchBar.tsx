import React from 'react';
import { Search, Sparkles } from 'lucide-react';
import { theme } from './theme';
import type { SpotMode } from './types';

interface SearchBarProps {
  mode: SpotMode;
  query: string;
  inputRef: React.Ref<HTMLInputElement>;
  onQueryChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onModeChange: (mode: SpotMode) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  mode,
  query,
  inputRef,
  onQueryChange,
  onKeyDown,
  onModeChange,
}) => (
  <div className="search-row">
    {mode === 'search' ? (
      <Search size={16} color={theme.dark} strokeWidth={2} />
    ) : (
      <Sparkles size={16} color={theme.dark} strokeWidth={2} />
    )}
    <input
      ref={inputRef}
      type="text"
      value={query}
      onChange={(e) => onQueryChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={
        mode === 'search'
          ? 'Search workflows, pages...'
          : 'Ask anything about your knowledge base...'
      }
      style={{
        flex: 1,
        border: 'none',
        background: 'none',
        fontSize: 14,
        fontFamily: theme.font.sans,
        color: theme.dark,
        outline: 'none',
      }}
    />
    {/* Search / AI toggle */}
    <div className="pill-toggle">
      <button
        onClick={() => onModeChange('search')}
        className={mode === 'search' ? 'pill-active' : ''}
        style={{
          padding: '4px 10px',
          border: 'none',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: theme.font.display,
          cursor: 'pointer',
          background: mode === 'search' ? 'rgba(26,26,26,0.08)' : theme.card,
          color: mode === 'search' ? theme.dark : theme.textMuted,
        }}
      >
        Search
      </button>
      <button
        onClick={() => onModeChange('ai')}
        className={mode === 'ai' ? 'pill-active' : ''}
        style={{
          padding: '4px 10px',
          border: 'none',
          borderLeft: '1px solid rgba(0,0,0,0.08)',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: theme.font.display,
          cursor: 'pointer',
          background: mode === 'ai' ? 'rgba(26,26,26,0.08)' : theme.card,
          color: mode === 'ai' ? theme.dark : theme.textMuted,
          display: 'flex',
          alignItems: 'center',
          gap: 3,
        }}
      >
        <Sparkles size={10} strokeWidth={2.5} />
        AI
      </button>
    </div>
  </div>
);
