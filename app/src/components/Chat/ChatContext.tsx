/**
 * React context for Chat state management.
 * Provides messages, loading state, context awareness, and panel visibility.
 */

import * as React from 'react';
import type { ChatMessage, ChatContext as ChatContextPayload } from '@/api/chat';
import { streamChatCompletion } from '@/api/chat';

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

  const sendMessage = React.useCallback(
    (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: ChatMessage = { role: 'user', content };
      const assistantMessage: ChatMessage = { role: 'assistant', content: '' };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);
      setError(null);

      // Abort any previous in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Build full message history for the request
      const allMessages: ChatMessage[] = [...messages, userMessage];

      streamChatCompletion(
        {
          messages: allMessages,
          stream: true,
          context: context ?? undefined,
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
            if (last?.role === 'assistant' && !last.content) {
              return prev.slice(0, -1);
            }
            return prev;
          });
        },
        controller.signal,
      );
    },
    [messages, isLoading, context],
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
