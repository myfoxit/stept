/**
 * Single chat message bubble — user or assistant.
 * Renders markdown-like formatting and tool call/result cards.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import type {
  ChatMessage as ChatMessageType,
  ToolCallEvent,
  ToolResultEvent,
} from '@/api/chat';
import {
  Wrench,
  Check,
  X,
  Loader2,
  File,
  Folder,
  Pencil,
  GitMerge,
  BarChart3,
  List,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatMessageProps {
  message: ChatMessageType;
}

// ── Tool display helpers ─────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  create_page: File,
  create_folder: Folder,
  rename_workflow: Pencil,
  merge_steps: GitMerge,
  analyze_workflow: BarChart3,
  list_workflows: List,
  suggest_workflow: Search,
};

const TOOL_LABELS: Record<string, string> = {
  create_page: 'Creating page',
  create_folder: 'Creating folder',
  rename_workflow: 'Renaming workflow',
  merge_steps: 'Merging steps',
  analyze_workflow: 'Analyzing workflow',
  list_workflows: 'Listing workflows',
  suggest_workflow: 'Searching workflows',
};

function ToolCallCard({ toolCall }: { toolCall: ToolCallEvent }) {
  const Icon = TOOL_ICONS[toolCall.name] || Wrench;
  const label = TOOL_LABELS[toolCall.name] || toolCall.name;
  const isExecuting = toolCall.status === 'executing';
  const isError = toolCall.status === 'error';

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-xs',
        isError
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : isExecuting
            ? 'border-primary/30 bg-primary/5 text-primary animate-pulse'
            : 'border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium">{label}</span>
      {isExecuting && (
        <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />
      )}
      {toolCall.status === 'completed' && (
        <Check className="ml-auto h-3.5 w-3.5" />
      )}
      {isError && <X className="ml-auto h-3.5 w-3.5" />}
    </div>
  );
}

function PendingConfirmationCard({
  result,
}: {
  result: ToolResultEvent;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const parsedResult = React.useMemo(() => {
    try {
      return typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
    } catch {
      return {};
    }
  }, [result]);

  if (!parsedResult.pending_confirmation) return null;

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const { confirmAction } = await import('@/api/spotlight');
      await confirmAction(parsedResult.action, parsedResult.params);
      setConfirmed(true);
    } catch (e: any) {
      setError(e.message || 'Failed to execute action');
    } finally {
      setConfirming(false);
    }
  };

  if (confirmed) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm dark:border-green-800 dark:bg-green-900/30">
        <Check className="h-4 w-4 text-green-600" />
        <span className="text-green-700 dark:text-green-400">Done!</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/30">
      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
        {parsedResult.message}
      </p>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={confirming}
          className="h-7 text-xs"
        >
          {confirming ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
          Confirm
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirmed(true)}
          className="h-7 text-xs"
        >
          <X className="mr-1 h-3 w-3" />
          Cancel
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ToolResultCard({ result }: { result: ToolResultEvent }) {
  const data = result.result;
  const isError = result.status === 'error' || !!data.error;

  // Check for pending confirmation
  const parsed = (() => { try { return typeof data === 'string' ? JSON.parse(data) : data; } catch { return null; } })();
  if (parsed?.pending_confirmation) {
    return <PendingConfirmationCard result={result} />;
  }

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        <span className="font-medium">Error:</span>{' '}
        {String(data.error || 'Unknown error')}
      </div>
    );
  }

  const message = data.message as string | undefined;

  // Render specific result types with richer UI
  if (data.document_id) {
    return (
      <div className="rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-xs text-green-700 dark:text-green-400">
        <div className="flex items-center gap-2">
          <File className="h-3.5 w-3.5" />
          <span className="font-medium">
            {message || `Created page: ${data.title || data.document_id}`}
          </span>
        </div>
      </div>
    );
  }

  if (data.folder_id && !data.workflow_id) {
    return (
      <div className="rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-xs text-green-700 dark:text-green-400">
        <div className="flex items-center gap-2">
          <Folder className="h-3.5 w-3.5" />
          <span className="font-medium">
            {message || `Created folder: ${data.name || data.folder_id}`}
          </span>
        </div>
      </div>
    );
  }

  if (data.workflows && Array.isArray(data.workflows)) {
    const workflows = data.workflows as Array<Record<string, unknown>>;
    return (
      <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs">
        <div className="mb-1.5 font-medium text-foreground">
          {message || `Found ${workflows.length} workflow(s)`}
        </div>
        <div className="space-y-1">
          {workflows.slice(0, 5).map((w, i) => (
            <div key={i} className="flex items-center gap-2 text-muted-foreground">
              <span className="font-mono text-[10px] text-muted-foreground/60">
                {String(w.id).slice(0, 5)}
              </span>
              <span>{String(w.name)}</span>
              {w.total_steps && (
                <span className="ml-auto text-muted-foreground/60">
                  {String(w.total_steps)} steps
                </span>
              )}
            </div>
          ))}
          {workflows.length > 5 && (
            <div className="text-muted-foreground/60">
              …and {workflows.length - 5} more
            </div>
          )}
        </div>
      </div>
    );
  }

  if (data.suggestions && Array.isArray(data.suggestions)) {
    const suggestions = data.suggestions as Array<Record<string, unknown>>;
    return (
      <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs">
        <div className="mb-1.5 font-medium text-foreground">
          {message || `Found ${suggestions.length} suggestion(s)`}
        </div>
        <div className="space-y-2">
          {suggestions.slice(0, 3).map((s, i) => (
            <div key={i} className="space-y-0.5">
              <div className="font-medium text-foreground">{String(s.name)}</div>
              {s.summary && (
                <div className="text-muted-foreground line-clamp-2">
                  {String(s.summary)}
                </div>
              )}
              {s.key_steps && Array.isArray(s.key_steps) && (
                <div className="text-muted-foreground/60">
                  {(s.key_steps as string[]).slice(0, 3).join(' → ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.step_breakdown) {
    // analyze_workflow result
    return (
      <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs">
        <div className="mb-1.5 font-medium text-foreground">
          {message || 'Workflow Analysis'}
        </div>
        <div className="space-y-1 text-muted-foreground">
          <div>
            <span className="font-medium">Steps:</span> {String(data.total_steps)}
          </div>
          <div>
            <span className="font-medium">Difficulty:</span> {String(data.difficulty)}
          </div>
          {data.applications_used && Array.isArray(data.applications_used) && (
            <div>
              <span className="font-medium">Apps:</span>{' '}
              {(data.applications_used as string[]).join(', ')}
            </div>
          )}
          {data.potential_duplicates && Number(data.potential_duplicates) > 0 && (
            <div className="text-amber-600 dark:text-amber-400">
              ⚠ {String(data.potential_duplicates)} potential duplicate(s)
            </div>
          )}
          {data.suggestions &&
            Array.isArray(data.suggestions) &&
            (data.suggestions as string[]).length > 0 && (
              <div className="mt-1 space-y-0.5">
                <div className="font-medium">Suggestions:</div>
                {(data.suggestions as string[]).map((s, i) => (
                  <div key={i} className="pl-2">• {s}</div>
                ))}
              </div>
            )}
        </div>
      </div>
    );
  }

  // Generic success result
  if (message) {
    return (
      <div className="rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-xs text-green-700 dark:text-green-400">
        <div className="flex items-center gap-2">
          <Check className="h-3.5 w-3.5" />
          <span>{message}</span>
        </div>
      </div>
    );
  }

  return null;
}

// ── Markdown rendering ───────────────────────────────────────────────────────

/**
 * Lightweight inline markdown renderer.
 * Handles: **bold**, `code`, ```code blocks```, line breaks, and basic lists.
 */
function renderContent(content: string): React.ReactNode {
  if (!content) return null;

  // Split on code blocks first
  const parts = content.split(/(```[\s\S]*?```)/g);

  return parts.map((part, i) => {
    // Code block
    if (part.startsWith('```') && part.endsWith('```')) {
      const inner = part.slice(3, -3);
      // Remove optional language identifier on first line
      const lines = inner.split('\n');
      const firstLine = lines[0]?.trim();
      const isLangId = firstLine && /^[a-z]+$/i.test(firstLine);
      const code = isLangId ? lines.slice(1).join('\n') : inner;
      return (
        <pre
          key={i}
          className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed"
        >
          <code>{code.trim()}</code>
        </pre>
      );
    }

    // Inline formatting
    return (
      <span key={i}>
        {part.split('\n').map((line, j, arr) => (
          <React.Fragment key={j}>
            {renderInline(line)}
            {j < arr.length - 1 && <br />}
          </React.Fragment>
        ))}
      </span>
    );
  });
}

function renderInline(text: string): React.ReactNode {
  // Markdown links: [text](url), bold: **text**, code: `text`
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((seg, i) => {
    // Markdown link
    const linkMatch = seg.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, linkText, url] = linkMatch;
      const isInternal = url.startsWith('/');
      if (isInternal) {
        return (
          <a
            key={i}
            href={url}
            className="text-primary underline hover:text-primary/80"
            onClick={(e) => {
              e.preventDefault();
              // Use React Router navigation without full page reload
              window.dispatchEvent(new CustomEvent('ondoki-navigate', { detail: url }));
            }}
          >
            {linkText}
          </a>
        );
      }
      return (
        <a
          key={i}
          href={url}
          className="text-primary underline hover:text-primary/80"
          target="_blank"
          rel="noopener noreferrer"
        >
          {linkText}
        </a>
      );
    }
    if (seg.startsWith('**') && seg.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold">
          {seg.slice(2, -2)}
        </strong>
      );
    }
    if (seg.startsWith('`') && seg.endsWith('`')) {
      return (
        <code
          key={i}
          className="rounded bg-muted px-1 py-0.5 text-xs font-mono"
        >
          {seg.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{seg}</React.Fragment>;
  });
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;
  const hasToolResults = message.tool_results && message.tool_results.length > 0;
  const hasContent = !!message.content;

  return (
    <div
      className={cn(
        'flex w-full',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-lg text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground px-3 py-2'
            : hasToolCalls || hasToolResults
              ? 'space-y-2 w-full max-w-[85%]'
              : 'bg-muted text-foreground px-3 py-2',
        )}
      >
        {/* Tool call indicators */}
        {hasToolCalls &&
          message.tool_calls!.map((tc, i) => (
            <ToolCallCard key={`tc-${i}`} toolCall={tc} />
          ))}

        {/* Tool results */}
        {hasToolResults &&
          message.tool_results!.map((tr, i) => (
            <ToolResultCard key={`tr-${i}`} result={tr} />
          ))}

        {/* Text content */}
        {hasContent && (
          <div
            className={cn(
              hasToolCalls || hasToolResults
                ? 'bg-muted text-foreground rounded-lg px-3 py-2'
                : '',
            )}
          >
            {renderContent(message.content)}
          </div>
        )}

        {/* Blinking cursor when streaming (no content yet, no tool events) */}
        {!isUser && !hasContent && !hasToolCalls && !hasToolResults && (
          <div className="bg-muted text-foreground rounded-lg px-3 py-2">
            <span className="inline-block h-4 w-1 animate-pulse bg-foreground/60" />
          </div>
        )}
      </div>
    </div>
  );
}
