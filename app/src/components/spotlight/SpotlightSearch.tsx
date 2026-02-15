import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconFileText,
  IconListDetails,
  IconSettings,
  IconPlus,
  IconBrain,
  IconAbc,
  IconRobot,
  IconLoader2,
  IconArrowRight,
  IconSparkles,
} from '@tabler/icons-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useProject } from '@/providers/project-provider';
import {
  unifiedSearch,
  unifiedSemanticSearch,
  type UnifiedSearchResult,
  type UnifiedSearchResponse,
} from '@/api/spotlight';
import { streamChatCompletion, type ToolCallEvent, type ToolResultEvent } from '@/api/chat';
import { SpotlightActions, type ActionCard } from './SpotlightActions';

// Question-like patterns that trigger semantic/AI search
const QUESTION_WORDS = /^(how|what|why|when|where|who|which|can|does|is|are|do|should|could|would)\b/i;

type SearchMode = 'idle' | 'keyword' | 'semantic' | 'ai';

interface SpotlightSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SpotlightSearch({ open, onOpenChange }: SpotlightSearchProps) {
  const navigate = useNavigate();
  const { selectedProject, selectedProjectId } = useProject();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [searchMode, setSearchMode] = useState<SearchMode>('idle');
  const [searchType, setSearchType] = useState<'keyword' | 'semantic'>('keyword');
  const [isSearching, setIsSearching] = useState(false);

  // AI state
  const [aiResponse, setAiResponse] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [aiActions, setAiActions] = useState<ActionCard[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController>();

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSearchMode('idle');
      setAiResponse('');
      setAiThinking(false);
      setAiActions([]);
    }
  }, [open]);

  const isQuestionLike = useCallback((q: string) => {
    return q.length > 20 || QUESTION_WORDS.test(q.trim());
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim() || !selectedProjectId) {
      setResults([]);
      setSearchMode('idle');
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      setSearchMode('keyword');

      try {
        // Fire keyword search
        const kwResults = await unifiedSearch(query, selectedProjectId);
        setResults(kwResults.results);
        setSearchType(kwResults.search_type);

        // Also fire semantic search in parallel if query looks like a question
        if (isQuestionLike(query)) {
          setSearchMode('semantic');
          try {
            const semResults = await unifiedSemanticSearch(query, selectedProjectId);
            if (semResults.results.length > 0) {
              // Merge: prefer semantic results but keep unique keyword results
              const semIds = new Set(semResults.results.map((r) => r.id));
              const uniqueKw = kwResults.results.filter((r) => !semIds.has(r.id));
              setResults([...semResults.results, ...uniqueKw]);
              setSearchType('semantic');
            }
          } catch {
            // Semantic search failed, keyword results are still shown
          }
        }

        // Auto-trigger AI if no results and query looks like natural language
        if (kwResults.total_results === 0 && isQuestionLike(query)) {
          triggerAI(query);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selectedProjectId, isQuestionLike]);

  const triggerAI = useCallback(
    (q: string) => {
      if (aiThinking) return;
      setSearchMode('ai');
      setAiThinking(true);
      setAiResponse('');
      setAiActions([]);

      // Cancel any previous AI request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const pendingActions: ActionCard[] = [];

      streamChatCompletion(
        {
          messages: [{ role: 'user', content: q }],
          context: { project_id: selectedProjectId || undefined },
          stream: true,
        },
        (text) => setAiResponse((prev) => prev + text),
        () => {
          setAiThinking(false);
          if (pendingActions.length > 0) {
            setAiActions([...pendingActions]);
          }
        },
        (error) => {
          console.error('AI error:', error);
          setAiThinking(false);
        },
        controller.signal,
        (toolCall: ToolCallEvent) => {
          // Parse tool call into action card
          try {
            const params = JSON.parse(toolCall.arguments);
            const label =
              toolCall.name === 'create_page'
                ? `Create page "${params.title || params.name || 'Untitled'}"`
                : `${toolCall.name}(${Object.keys(params).join(', ')})`;
            pendingActions.push({
              id: toolCall.id,
              action: toolCall.name,
              label,
              params,
            });
          } catch {
            // skip malformed
          }
        },
      );
    },
    [selectedProjectId, aiThinking],
  );

  const handleSelect = (result: UnifiedSearchResult) => {
    onOpenChange(false);
    if (result.type === 'workflow') {
      navigate(`/workflow/${result.id}`);
    } else {
      navigate(`/editor/${result.id}`);
    }
  };

  const handleStepSelect = (workflowId: string, stepNumber: number) => {
    onOpenChange(false);
    navigate(`/workflow/${workflowId}#step-${stepNumber}`);
  };

  const workflows = results.filter((r) => r.type === 'workflow');
  const documents = results.filter((r) => r.type === 'document');

  const modeIcon =
    searchMode === 'semantic' ? (
      <IconBrain className="h-3 w-3" />
    ) : searchMode === 'ai' ? (
      <IconRobot className="h-3 w-3" />
    ) : (
      <IconAbc className="h-3 w-3" />
    );

  const modeLabel =
    searchMode === 'semantic' ? 'Semantic' : searchMode === 'ai' ? 'AI' : 'Keyword';

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Spotlight Search"
      description="Search workflows, pages, or ask AI"
      showCloseButton={false}
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Search workflows, pages, or ask AI..."
        value={query}
        onValueChange={setQuery}
      />

      {/* Search mode indicator */}
      {searchMode !== 'idle' && (
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <Badge variant="outline" className="gap-1 text-xs">
            {modeIcon}
            {modeLabel}
          </Badge>
          {isSearching && <IconLoader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          {searchType === 'semantic' && (
            <span className="text-xs text-muted-foreground">🧠 Semantic results</span>
          )}
        </div>
      )}

      <CommandList className="max-h-[400px]">
        {/* Idle state: Quick Actions */}
        {searchMode === 'idle' && (
          <CommandGroup heading="Quick Actions">
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                navigate('/editor/new');
              }}
            >
              <IconFileText className="mr-2 h-4 w-4" />
              New Page
              <CommandShortcut>⌘N</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                // Navigate to workflow recording or creation
              }}
            >
              <IconListDetails className="mr-2 h-4 w-4" />
              New Workflow
              <CommandShortcut>⌘W</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                if (selectedProjectId) navigate(`/projects/${selectedProjectId}/settings`);
              }}
            >
              <IconSettings className="mr-2 h-4 w-4" />
              Settings
              <CommandShortcut>⌘,</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        )}

        {/* Search Results */}
        {searchMode !== 'idle' && results.length === 0 && !aiThinking && !aiResponse && (
          <CommandEmpty>
            No results found.{' '}
            <button
              className="text-primary underline"
              onClick={() => triggerAI(query)}
            >
              Ask AI →
            </button>
          </CommandEmpty>
        )}

        {/* Workflows */}
        {workflows.length > 0 && (
          <CommandGroup heading={`Workflows (${workflows.length})`}>
            {workflows.map((wf) => (
              <div key={wf.id}>
                <CommandItem onSelect={() => handleSelect(wf)}>
                  <IconListDetails className="mr-2 h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{wf.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {Math.round(wf.score * 100)}%
                  </span>
                </CommandItem>
                {wf.matching_steps?.slice(0, 2).map((step) => (
                  <CommandItem
                    key={step.step_id}
                    className="pl-8 text-xs text-muted-foreground"
                    onSelect={() => handleStepSelect(wf.id, step.step_number)}
                  >
                    <IconArrowRight className="mr-1 h-3 w-3" />
                    Step {step.step_number}
                    {step.generated_title ? `: ${step.generated_title}` : ''}
                  </CommandItem>
                ))}
              </div>
            ))}
          </CommandGroup>
        )}

        {/* Documents */}
        {documents.length > 0 && (
          <CommandGroup heading={`Pages (${documents.length})`}>
            {documents.map((doc) => (
              <CommandItem key={doc.id} onSelect={() => handleSelect(doc)}>
                <IconFileText className="mr-2 h-4 w-4 shrink-0" />
                <div className="flex flex-1 flex-col">
                  <span className="truncate">{doc.name || 'Untitled'}</span>
                  {doc.preview && (
                    <span className="truncate text-xs text-muted-foreground">
                      {doc.preview}
                    </span>
                  )}
                </div>
                <span className="ml-2 text-xs text-muted-foreground">
                  {Math.round(doc.score * 100)}%
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* AI Response */}
        {(aiThinking || aiResponse) && (
          <>
            <CommandSeparator />
            <CommandGroup heading="🤖 AI">
              {aiThinking && !aiResponse && (
                <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                  <IconLoader2 className="h-4 w-4 animate-spin" />
                  Thinking...
                </div>
              )}
              {aiResponse && (
                <div className="whitespace-pre-wrap px-2 py-3 text-sm">
                  {aiResponse}
                </div>
              )}
              {aiActions.length > 0 && (
                <SpotlightActions
                  actions={aiActions}
                  projectId={selectedProjectId || undefined}
                  onActionComplete={() => {
                    // Could refresh results or close
                  }}
                />
              )}
            </CommandGroup>
          </>
        )}
      </CommandList>

      {/* Footer */}
      {searchMode !== 'idle' && searchMode !== 'ai' && !aiThinking && (
        <div className="flex items-center justify-between border-t px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => triggerAI(query)}
          >
            <IconSparkles className="h-3 w-3" />
            Ask AI →
          </Button>
        </div>
      )}
    </CommandDialog>
  );
}
