import * as React from 'react';
import DOMPurify from 'dompurify';
import { useNavigate } from 'react-router-dom';
import {
  IconSearch,
  IconX,
  IconFileText,
  IconArrowRight,
  IconSparkles,
  IconLoader2,
  IconBrain,
  IconAbc,
} from '@tabler/icons-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { smartSearch, type SearchResult, type SearchResponse } from '@/api/processing';
import { semanticSearch, type SemanticSearchResult, type SemanticSearchResponse } from '@/api/search';
import { useProject } from '@/providers/project-provider';

interface SearchBarProps {
  className?: string;
}

export function SearchBar({ className }: SearchBarProps) {
  const navigate = useNavigate();
  const { selectedProject } = useProject();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResponse | null>(null);
  const [semanticResults, setSemanticResults] = React.useState<SemanticSearchResponse | null>(null);
  const [isSearching, setIsSearching] = React.useState(false);
  const [showResults, setShowResults] = React.useState(false);
  const [searchMode, setSearchMode] = React.useState<'smart' | 'semantic'>('smart');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>();

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced search
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim() || !selectedProject?.id) {
      setResults(null);
      setSemanticResults(null);
      setShowResults(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        if (searchMode === 'semantic') {
          const data = await semanticSearch(query, selectedProject.id);
          setSemanticResults(data);
          setResults(null);
        } else {
          const data = await smartSearch(query, selectedProject.id);
          setResults(data);
          setSemanticResults(null);
        }
        setShowResults(true);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selectedProject?.id, searchMode]);

  const handleResultClick = (recordingId: string, stepNumber?: number) => {
    setShowResults(false);
    setQuery('');
    const url = stepNumber
      ? `/workflow/${recordingId}#step-${stepNumber}`
      : `/workflow/${recordingId}`;
    navigate(url);
  };

  const handleClear = () => {
    setQuery('');
    setResults(null);
    setSemanticResults(null);
    setShowResults(false);
    inputRef.current?.focus();
  };

  const toggleSearchMode = () => {
    setSearchMode((prev) => (prev === 'smart' ? 'semantic' : 'smart'));
  };

  const totalResults = searchMode === 'semantic'
    ? semanticResults?.total_results ?? 0
    : results?.total_results ?? 0;

  const hasResults = searchMode === 'semantic' ? !!semanticResults : !!results;

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      <div className="relative">
        <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => hasResults && setShowResults(true)}
          placeholder={searchMode === 'semantic' ? 'Semantic search…' : 'Search workflows…'}
          className="h-8 pl-8 pr-16 text-sm w-48 lg:w-64"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <button
            onClick={toggleSearchMode}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title={searchMode === 'semantic' ? 'Switch to keyword search' : 'Switch to semantic search'}
          >
            {searchMode === 'semantic' ? (
              <IconBrain className="h-3.5 w-3.5 text-primary" />
            ) : (
              <IconAbc className="h-3.5 w-3.5" />
            )}
          </button>
          {query && (
            <button
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground"
            >
              {isSearching ? (
                <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <IconX className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Results dropdown */}
      {showResults && hasResults && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border bg-popover shadow-lg max-h-96 overflow-auto">
          {totalResults === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No results for "{searchMode === 'semantic' ? semanticResults?.query : results?.query}"
            </div>
          ) : (
            <div className="py-1">
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground flex items-center justify-between">
                <span>{totalResults} result{totalResults !== 1 ? 's' : ''}</span>
                {searchMode === 'semantic' && semanticResults && (
                  <span className="flex items-center gap-1">
                    <IconBrain className="h-3 w-3" />
                    {semanticResults.search_type === 'semantic' ? 'AI' : 'Keyword'}
                  </span>
                )}
              </div>
              {searchMode === 'semantic' && semanticResults
                ? semanticResults.results.map((result) => (
                    <SemanticResultItem
                      key={result.recording_id}
                      result={result}
                      onClick={handleResultClick}
                    />
                  ))
                : results?.results.map((result) => (
                    <SearchResultItem
                      key={result.recording_id}
                      result={result}
                      onClick={handleResultClick}
                    />
                  ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchResultItem({
  result,
  onClick,
}: {
  result: SearchResult;
  onClick: (recordingId: string, stepNumber?: number) => void;
}) {
  return (
    <div className="border-b last:border-0">
      {/* Recording-level result */}
      <button
        onClick={() => onClick(result.recording_id)}
        className="w-full px-3 py-2 text-left hover:bg-accent transition-colors flex items-start gap-2"
      >
        <IconFileText className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="text-sm font-medium truncate"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(result.name_highlighted || result.name) }}
            />
            {result.is_processed && (
              <IconSparkles className="h-3 w-3 text-primary flex-shrink-0" />
            )}
          </div>
          {result.summary_highlighted && result.summary && (
            <p
              className="text-xs text-muted-foreground line-clamp-1 mt-0.5"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(result.summary_highlighted) }}
            />
          )}
          {result.tags && result.tags.length > 0 && (
            <div className="flex gap-1 mt-1">
              {result.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] h-4 px-1">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <IconArrowRight className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
      </button>

      {/* Matching steps within this recording */}
      {result.matching_steps.length > 0 && (
        <div className="pl-9 pr-3 pb-1">
          {result.matching_steps.slice(0, 3).map((step) => (
            <button
              key={step.step_id}
              onClick={() => onClick(result.recording_id, step.step_number)}
              className="w-full text-left px-2 py-1 rounded text-xs hover:bg-accent transition-colors flex items-center gap-2"
            >
              <span className="text-muted-foreground flex-shrink-0">
                Step {step.step_number}:
              </span>
              <span
                className="truncate"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(step.generated_title_highlighted || step.description_highlighted || step.description || ''),
                }}
              />
            </button>
          ))}
          {result.matching_steps.length > 3 && (
            <span className="text-[10px] text-muted-foreground pl-2">
              +{result.matching_steps.length - 3} more steps
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SemanticResultItem({
  result,
  onClick,
}: {
  result: SemanticSearchResult;
  onClick: (recordingId: string, stepNumber?: number) => void;
}) {
  const scorePercent = Math.round(result.score * 100);
  const scoreColor =
    scorePercent >= 70
      ? 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30'
      : scorePercent >= 40
        ? 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/30'
        : 'text-muted-foreground bg-muted';

  return (
    <div className="border-b last:border-0">
      <button
        onClick={() => onClick(result.recording_id)}
        className="w-full px-3 py-2 text-left hover:bg-accent transition-colors flex items-start gap-2"
      >
        <IconFileText className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium truncate">
              {result.generated_title || result.name}
            </span>
            {result.is_processed && (
              <IconSparkles className="h-3 w-3 text-primary flex-shrink-0" />
            )}
            <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${scoreColor}`}>
              {scorePercent}%
            </span>
          </div>
          {result.summary && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {result.summary}
            </p>
          )}
          {result.tags && result.tags.length > 0 && (
            <div className="flex gap-1 mt-1">
              {result.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] h-4 px-1">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <IconArrowRight className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
      </button>

      {/* Matching steps with scores */}
      {result.matching_steps.length > 0 && (
        <div className="pl-9 pr-3 pb-1">
          {result.matching_steps.slice(0, 3).map((step) => (
            <button
              key={step.step_id}
              onClick={() => onClick(result.recording_id, step.step_number)}
              className="w-full text-left px-2 py-1 rounded text-xs hover:bg-accent transition-colors flex items-center gap-2"
            >
              <span className="text-muted-foreground flex-shrink-0">
                Step {step.step_number}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                ({Math.round(step.score * 100)}%)
              </span>
            </button>
          ))}
          {result.matching_steps.length > 3 && (
            <span className="text-[10px] text-muted-foreground pl-2">
              +{result.matching_steps.length - 3} more steps
            </span>
          )}
        </div>
      )}
    </div>
  );
}
