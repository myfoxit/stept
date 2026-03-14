import React from 'react';
import { Search, Sparkles } from 'lucide-react';
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
      <Search size={16} strokeWidth={2} />
    ) : (
      <Sparkles size={16} strokeWidth={2} />
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
      className="search-input"
    />
    {/* Search / AI toggle */}
    <div className="pill-toggle">
      <button
        onClick={() => onModeChange('search')}
        className={`pill-btn${mode === 'search' ? ' pill-active' : ''}`}
      >
        Search
      </button>
      <button
        onClick={() => onModeChange('ai')}
        className={`pill-btn pill-btn--ai${mode === 'ai' ? ' pill-active' : ''}`}
      >
        <Sparkles size={10} strokeWidth={2.5} />
        AI
      </button>
    </div>
  </div>
);
