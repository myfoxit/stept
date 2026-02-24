/**
 * Hook that manages streaming inline AI commands.
 * Handles the SSE connection, text accumulation, and editor insertion.
 */

import { useCallback, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { streamInlineAI, type AICommand } from '@/api/inlineAI';

export type AIStatus = 'idle' | 'prompting' | 'streaming' | 'done' | 'error';

interface UseAICommandReturn {
  status: AIStatus;
  error: string | null;
  /** Execute an AI command. For 'write', pass the prompt. */
  execute: (params: {
    command: AICommand;
    editor: Editor;
    prompt?: string;
    language?: string;
  }) => void;
  /** Cancel the current operation */
  cancel: () => void;
}

/**
 * Get the selected text or surrounding paragraph text for context.
 */
function getContextText(editor: Editor): string {
  const { from, to, empty } = editor.state.selection;

  if (!empty) {
    // Use selected text
    return editor.state.doc.textBetween(from, to, '\n');
  }

  // No selection — grab the current paragraph / block
  const $from = editor.state.doc.resolve(from);
  const parent = $from.parent;
  return parent.textContent || '';
}

export function useAICommand(): UseAICommandReturn {
  const [status, setStatus] = useState<AIStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
    setError(null);
  }, []);

  const execute = useCallback(
    ({
      command,
      editor,
      prompt,
      language,
    }: {
      command: AICommand;
      editor: Editor;
      prompt?: string;
      language?: string;
    }) => {
      // Cancel any in-progress request
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      const context = getContextText(editor);
      const { from, to, empty } = editor.state.selection;

      // For context-based commands, if there's selected text we'll replace it.
      // For write commands, we insert at cursor.
      const hasSelection = !empty;
      let insertPos = from;

      if (hasSelection && command !== 'write') {
        // Delete the selected text first, we'll replace it
        editor.chain().focus().deleteRange({ from, to }).run();
        insertPos = from;
      } else {
        insertPos = editor.state.selection.from;
      }

      setStatus('streaming');
      setError(null);

      // Track insertion point — as we insert text, the position advances
      let currentPos = insertPos;

      streamInlineAI(
        { command, prompt, context: context || undefined, language },
        // onChunk
        (text: string) => {
          // Insert the chunk at the current position
          editor
            .chain()
            .focus()
            .insertContentAt(currentPos, text)
            .run();
          currentPos += text.length;
        },
        // onDone
        () => {
          setStatus('done');
          abortRef.current = null;
          // Reset status after a brief moment
          setTimeout(() => setStatus('idle'), 1500);
        },
        // onError
        (err: Error) => {
          setStatus('error');
          setError(err.message);
          abortRef.current = null;
          setTimeout(() => {
            setStatus('idle');
            setError(null);
          }, 3000);
        },
        controller.signal,
      );
    },
    [],
  );

  return { status, error, execute, cancel };
}
