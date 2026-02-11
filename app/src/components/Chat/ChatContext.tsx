/**
 * React context for Chat state management.
 * Provides messages, loading state, context awareness, panel visibility,
 * and tool call/result tracking.
 */

import * as React from 'react';
import type {
  ChatMessage,
  ChatContext as ChatContextPayload,
  ToolCallEvent,
  ToolResultEvent,
} from '@/api/chat';
import { streamChatCompletion } from '@/api/chat';
import { useProject } from '@/providers/project-provider';

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  isOpen: boolean;
  context: ChatContextPayload | null;
  error: string | null;
}

interface ChatActions {
  sendMessage: (content: string) => void;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  setContext: (ctx: ChatContextPayload | null) => void;
  clearMessages: () => void;
}

type ChatContextValue = ChatState & ChatActions;

// ── Context ──────────────────────────────────────────────────────────────────

const ChatCtx = React.createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const ctx = React.useContext(ChatCtx);
  if (!ctx) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const [context, setContext] = React.useState<ChatContextPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const { selectedProjectId } = useProject();

  // Build effective context: always include project_id from global state
  const effectiveContext = React.useMemo<ChatContextPayload | undefined>(() => {
    const pid = context?.project_id || selectedProjectId || undefined;
    if (!pid && !context?.recording_id && !context?.document_id) return undefined;
    return {
      ...context,
      project_id: pid,
    };
  }, [context, selectedProjectId]);

  const sendMessage = React.useCallback(
    (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: ChatMessage = { role: 'user', content };
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: '',
        tool_calls: [],
        tool_results: [],
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);
      setError(null);

      // Abort any previous in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Build full message history for the request (only role + content)
      const allMessages: ChatMessage[] = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      streamChatCompletion(
        {
          messages: allMessages,
          stream: true,
          context: effectiveContext,
        },
        // onChunk — append to the last (assistant) message
        (text: string) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + text,
              };
            }
            return updated;
          });
        },
        // onDone
        () => {
          setIsLoading(false);
        },
        // onError
        (err: Error) => {
          setIsLoading(false);
          setError(err.message);
          // Remove the empty assistant message on error
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && !last.content && !last.tool_calls?.length && !last.tool_results?.length) {
              return prev.slice(0, -1);
            }
            return prev;
          });
        },
        controller.signal,
        // onToolCall
        (toolCall: ToolCallEvent) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              const existingCalls = last.tool_calls || [];
              updated[updated.length - 1] = {
                ...last,
                tool_calls: [...existingCalls, toolCall],
              };
            }
            return updated;
          });
        },
        // onToolResult
        (toolResult: ToolResultEvent) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              const existingResults = last.tool_results || [];
              // Also update the matching tool_call status
              const updatedCalls = (last.tool_calls || []).map((tc) =>
                tc.id === toolResult.tool_call_id
                  ? { ...tc, status: toolResult.status as ToolCallEvent['status'] }
                  : tc,
              );
              updated[updated.length - 1] = {
                ...last,
                tool_calls: updatedCalls,
                tool_results: [...existingResults, toolResult],
              };
            }
            return updated;
          });
        },
      );
    },
    [messages, isLoading, effectiveContext],
  );

  const togglePanel = React.useCallback(() => setIsOpen((v) => !v), []);
  const openPanel = React.useCallback(() => setIsOpen(true), []);
  const closePanel = React.useCallback(() => setIsOpen(false), []);
  const clearMessages = React.useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
  }, []);

  const value = React.useMemo<ChatContextValue>(
    () => ({
      messages,
      isLoading,
      isOpen,
      context,
      error,
      sendMessage,
      togglePanel,
      openPanel,
      closePanel,
      setContext,
      clearMessages,
    }),
    [messages, isLoading, isOpen, context, error, sendMessage, togglePanel, openPanel, closePanel, clearMessages],
  );

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}
