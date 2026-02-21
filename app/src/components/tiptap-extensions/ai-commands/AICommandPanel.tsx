/**
 * AI Command Panel — inline UI shown when an AI command is triggered.
 *
 * For `/ai write`: shows a text input for the user's prompt.
 * For other commands: shows a loading/streaming indicator.
 * Displays a "✨ AI" badge while generating.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useAICommand, type AIStatus } from './useAICommand';
import type { AICommandDef } from './commands';
import { cn } from '@/lib/utils';

interface AICommandPanelProps {
  editor: Editor;
  command: AICommandDef | null;
  coords: { x: number; y: number };
  onClose: () => void;
}

export const AICommandPanel: React.FC<AICommandPanelProps> = ({
  editor,
  command,
  coords,
  onClose,
}) => {
  const { status, error, execute, cancel } = useAICommand();
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input when command changes
  useEffect(() => {
    if (command?.needsPrompt) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [command]);

  // Auto-execute context-based commands immediately
  useEffect(() => {
    if (command && !command.needsPrompt) {
      execute({ command: command.command, editor });
    }
  }, [command]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close when done (after a brief delay to show the status)
  useEffect(() => {
    if (status === 'done') {
      const t = setTimeout(onClose, 800);
      return () => clearTimeout(t);
    }
  }, [status, onClose]);

  // Escape to cancel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancel();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancel, onClose]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!command || !prompt.trim()) return;
      execute({ command: command.command, editor, prompt: prompt.trim() });
      setPrompt('');
    },
    [command, editor, execute, prompt],
  );

  if (!command) return null;

  return (
    <div
      className="fixed z-50"
      style={{ left: coords.x, top: coords.y + 4 }}
    >
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-[#6C5CE7]/30 bg-background px-3 py-2 shadow-lg',
          'min-w-[320px] max-w-[440px]',
          'animate-in fade-in-0 zoom-in-95 duration-150',
          'ring-1 ring-[#6C5CE7]/20',
        )}
      >
        {/* AI badge */}
        <StatusBadge status={status} />

        {/* Prompt input for /ai write */}
        {command.needsPrompt && status === 'idle' && (
          <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask AI to write..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!prompt.trim()}
              className="rounded-md bg-[#6C5CE7] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#5A4BD1] disabled:opacity-50"
            >
              Go
            </button>
          </form>
        )}

        {/* Status text */}
        {status === 'streaming' && (
          <span className="text-xs text-muted-foreground">
            Generating…
          </span>
        )}
        {status === 'done' && (
          <span className="text-xs text-green-600">Done ✓</span>
        )}
        {status === 'error' && (
          <span className="text-xs text-destructive" title={error || undefined}>
            Error — {error || 'something went wrong'}
          </span>
        )}

        {/* Command label for context commands while idle/streaming */}
        {!command.needsPrompt && status === 'idle' && (
          <span className="text-xs text-muted-foreground">
            {command.description}…
          </span>
        )}

        {/* Cancel button during streaming */}
        {status === 'streaming' && (
          <button
            onClick={() => { cancel(); onClose(); }}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Esc
          </button>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AIStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium',
        status === 'streaming' && 'bg-[#6C5CE7]/10 text-[#6C5CE7] dark:bg-[#6C5CE7]/20 dark:text-[#A594FF]',
        status === 'done' && 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
        status === 'error' && 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
        status === 'idle' && 'bg-[#6C5CE7]/10 text-[#6C5CE7] dark:bg-[#6C5CE7]/20 dark:text-[#A594FF]',
        status === 'prompting' && 'bg-[#6C5CE7]/10 text-[#6C5CE7] dark:bg-[#6C5CE7]/20 dark:text-[#A594FF]',
      )}
    >
      <span className={cn(
        status === 'streaming' && 'animate-pulse',
      )}>
        ✨
      </span>
      AI
    </span>
  );
}
