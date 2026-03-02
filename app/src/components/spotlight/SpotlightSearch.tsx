import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  ListTree,
  Settings,
  Brain,
  CaseSensitive,
  Sparkles,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Globe,
  Monitor,
} from 'lucide-react';
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
import { useChat } from '@/components/Chat/ChatContext';
import { useCreateDocument } from '@/hooks/api/documents';
import {
  unifiedSearch,
  type UnifiedSearchResult,
} from '@/api/spotlight';
import { getFolderTree, type FolderTreeRead } from '@/api/folders';

export type SpotlightMode = 'default' | 'insert-workflow';

interface SpotlightSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set to 'insert-workflow', only shows workflows and calls onInsertWorkflow instead of navigating. */
  mode?: SpotlightMode;
  /** Called when a workflow is selected in insert-workflow mode. */
  onInsertWorkflow?: (workflowId: string) => void;
}

export function SpotlightSearch({ open, onOpenChange, mode = 'default', onInsertWorkflow }: SpotlightSearchProps) {
  const isInsertMode = mode === 'insert-workflow';
  const navigate = useNavigate();
  const { selectedProject, selectedProjectId } = useProject();
  const { openPanel, sendMessage } = useChat();
  const createDoc = useCreateDocument();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchType, setSearchType] = useState<'keyword' | 'semantic'>('keyword');
  const [showWorkflowChooser, setShowWorkflowChooser] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Preload all workflows for insert mode
  const [allWorkflows, setAllWorkflows] = useState<FolderTreeRead[]>([]);
  useEffect(() => {
    if (!isInsertMode || !open || !selectedProjectId) return;
    getFolderTree(selectedProjectId).then((tree) => {
      const wfs: FolderTreeRead[] = [];
      const walk = (nodes: FolderTreeRead[]) => {
        for (const n of nodes) {
          if (n.is_workflow) wfs.push(n);
          if (n.children?.length) walk(n.children);
        }
      };
      walk(tree);
      setAllWorkflows(wfs);
    }).catch(() => {});
  }, [isInsertMode, open, selectedProjectId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSearchType('keyword');
      setShowWorkflowChooser(false);
    }
  }, [open]);

  // Debounced search — unified-v2 handles keyword + semantic fusion via RRF
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim() || !selectedProjectId) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);

      try {
        const response = await unifiedSearch(query, selectedProjectId);
        setResults(response.results);
        setSearchType(response.search_type || 'keyword');
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selectedProjectId]);

  const handleSelect = (result: UnifiedSearchResult) => {
    if (mode === 'insert-workflow' && result.type === 'workflow') {
      onInsertWorkflow?.(result.id);
      return;
    }
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

  const handleAskAI = () => {
    const q = query;
    onOpenChange(false);
    openPanel();
    // Small delay to let the panel open before sending
    setTimeout(() => sendMessage(q), 100);
  };

  const workflows = results.filter((r) => r.type === 'workflow');
  const documents = results.filter((r) => r.type === 'document');
  const hasQuery = query.trim().length > 0;
  const hasResults = results.length > 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isInsertMode ? "Insert Workflow" : "Spotlight Search"}
      description={isInsertMode ? "Search and select a workflow to insert" : "Search workflows, pages, or ask AI"}
      showCloseButton={false}
      shouldFilter={false}
    >
      <CommandInput
        {...{ placeholder: isInsertMode ? "Search workflows to insert…" : "Search workflows, pages, or ask AI..." }}
        value={query}
        onValueChange={setQuery}
      />

      {/* Search mode indicator */}
      {hasQuery && !isInsertMode && (
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <Badge variant="outline" className="gap-1 text-xs">
            {searchType === 'semantic' ? (
              <Brain className="h-3 w-3" />
            ) : (
              <CaseSensitive className="h-3 w-3" />
            )}
            {searchType === 'semantic' ? 'Semantic' : 'Keyword'}
          </Badge>
          {isSearching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
      )}

      <CommandList className="max-h-[400px]">
        {/* Idle state: Quick Actions or Workflow Type Chooser */}
        {!hasQuery && !showWorkflowChooser && !isInsertMode && (
          <CommandGroup heading="Quick Actions">
            <CommandItem
              onSelect={async () => {
                onOpenChange(false);
                if (selectedProjectId) {
                  const newDoc = await createDoc.mutateAsync({
                    title: 'Untitled',
                    projectId: selectedProjectId,
                    isPrivate: true,
                  });
                  navigate(`/editor/${newDoc.id}`);
                }
              }}
            >
              <FileText className="mr-2 h-4 w-4" />
              New Page
              <CommandShortcut>⌘⇧N</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setShowWorkflowChooser(true);
              }}
            >
              <ListTree className="mr-2 h-4 w-4" />
              New Workflow
              <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </CommandItem>
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                if (selectedProjectId) navigate(`/projects/${selectedProjectId}/settings`);
              }}
            >
              <Settings className="mr-2 h-4 w-4" />
              Project Settings
              <CommandShortcut>⌘⇧,</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        )}

        {/* Workflow type chooser sub-menu */}
        {!hasQuery && showWorkflowChooser && !isInsertMode && (
          <CommandGroup heading="New Workflow">
            <CommandItem
              onSelect={() => {
                setShowWorkflowChooser(false);
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4 text-muted-foreground" />
              Back
            </CommandItem>
            <CommandSeparator />
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                // Open the browser extension recording flow
                window.dispatchEvent(new CustomEvent('ondoki:start-browser-workflow'));
              }}
            >
              <Globe className="mr-2 h-4 w-4" />
              Browser Workflow
              <span className="ml-auto text-xs text-muted-foreground">Record in browser</span>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                // Open the desktop recording flow
                window.dispatchEvent(new CustomEvent('ondoki:start-desktop-workflow'));
              }}
            >
              <Monitor className="mr-2 h-4 w-4" />
              Desktop Workflow
              <span className="ml-auto text-xs text-muted-foreground">Record on desktop</span>
            </CommandItem>
          </CommandGroup>
        )}

        {/* Insert mode: show all workflows when idle */}
        {!hasQuery && isInsertMode && (
          <CommandGroup heading="All Workflows">
            {allWorkflows.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No workflows found</div>
            ) : (
              allWorkflows.map((wf) => (
                <CommandItem
                  key={wf.id}
                  value={wf.name || 'Untitled Workflow'}
                  onSelect={() => {
                    onInsertWorkflow?.(wf.id);
                  }}
                >
                  <ListTree className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">{wf.name || 'Untitled Workflow'}</span>
                </CommandItem>
              ))
            )}
          </CommandGroup>
        )}

        {/* No results */}
        {hasQuery && !isSearching && !hasResults && (
          <CommandEmpty>
            No results for "{query}"
          </CommandEmpty>
        )}

        {/* Workflows */}
        {workflows.length > 0 && (
          <CommandGroup heading={`Workflows (${workflows.length})`}>
            {workflows.map((wf: any) => (
              <CommandItem key={wf.id} onSelect={() => handleSelect(wf)}>
                <ListTree className="mr-2 h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex flex-1 flex-col min-w-0">
                  <span className="truncate">{wf.name}</span>
                  {(wf.snippet || wf.summary) && (
                    <span
                      className="truncate text-xs text-muted-foreground"
                      dangerouslySetInnerHTML={{
                        __html: wf.snippet || wf.summary || '',
                      }}
                    />
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Documents / Pages */}
        {documents.length > 0 && !isInsertMode && (
          <CommandGroup heading={`Pages (${documents.length})`}>
            {documents.map((doc) => (
              <CommandItem key={doc.id} onSelect={() => handleSelect(doc)}>
                <FileText className="mr-2 h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex flex-1 flex-col min-w-0">
                  <span className="truncate">{doc.name || 'Untitled'}</span>
                  {(doc.preview || (doc as any).snippet) && (
                    <span
                      className="truncate text-xs text-muted-foreground"
                      dangerouslySetInnerHTML={{
                        __html: (doc as any).snippet || doc.preview || '',
                      }}
                    />
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>

      {/* Footer: result count + Ask AI suggestion */}
      {hasQuery && !isSearching && !isInsertMode && (
        <div className="flex items-center justify-between border-t px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={handleAskAI}
          >
            <Sparkles className="h-3 w-3" />
            Ask AI
          </Button>
        </div>
      )}
    </CommandDialog>
  );
}
