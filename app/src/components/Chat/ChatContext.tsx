/**
 * React context for Chat state management.
 * Provides messages, loading state, context awareness, panel visibility,
 * tool call/result tracking, and persisted session history.
 */

import * as React from 'react';
import type {
  ChatMessage,
  ChatContext as ChatContextPayload,
  ToolCallEvent,
  ToolResultEvent,
} from '@/api/chat';
import { streamChatCompletion, fetchChatSession, deleteChatSession } from '@/api/chat';
import { useProject } from '@/providers/project-provider';
import { useAuth } from '@/providers/auth-provider';

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  isOpen: boolean;
  context: ChatContextPayload | null;
  error: string | null;
  sessionId: string | null;
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

const ChatCtx = React.createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const ctx = React.useContext(ChatCtx);
  if (!ctx) throw new Error('useChat must be used within a ChatProvider');
  return ctx;
}

function storageKey(userId?: string, projectId?: string | null, context?: ChatContextPayload | null): string | null {
  if (!userId) return null;
  const scope = [projectId || 'none', context?.recording_id || 'none', context?.document_id || 'none'].join(':');
  return `stept_chat_session_${userId}_${scope}`;
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const [context, setContext] = React.useState<ChatContextPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const { selectedProjectId } = useProject();
  const { user } = useAuth();

  const effectiveContext = React.useMemo<ChatContextPayload | undefined>(() => {
    const pid = context?.project_id || selectedProjectId || undefined;
    if (!pid && !context?.recording_id && !context?.document_id) return undefined;
    return { ...context, project_id: pid };
  }, [context, selectedProjectId]);

  const storageKeyValue = React.useMemo(
    () => storageKey(user?.id, selectedProjectId, context),
    [user?.id, selectedProjectId, context],
  );

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!storageKeyValue) return;
      const stored = localStorage.getItem(storageKeyValue);
      if (!stored) {
        setSessionId(null);
        setMessages([]);
        return;
      }
      try {
        const session = await fetchChatSession(stored);
        if (cancelled) return;
        setSessionId(session.session.id);
        setMessages(session.messages.filter((m) => m.role !== 'system'));
      } catch {
        if (!cancelled) {
          localStorage.removeItem(storageKeyValue);
          setSessionId(null);
          setMessages([]);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [storageKeyValue]);

  const sendMessage = React.useCallback(
    (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: ChatMessage = { role: 'user', content };
      const assistantMessage: ChatMessage = { role: 'assistant', content: '', tool_calls: [], tool_results: [] };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);
      setError(null);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const allMessages: ChatMessage[] = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const lastRealMessage = [...messages].reverse().find((m) => m.id);

      streamChatCompletion(
        {
          messages: allMessages,
          stream: true,
          context: effectiveContext,
          session_id: sessionId || undefined,
          parent_message_id: lastRealMessage?.id,
        },
        (text: string) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + text };
            }
            return updated;
          });
        },
        async () => {
          setIsLoading(false);
          const sid = sessionId || (storageKeyValue ? localStorage.getItem(storageKeyValue) : null);
          if (sid) {
            try {
              const session = await fetchChatSession(sid);
              setSessionId(session.session.id);
              setMessages(session.messages.filter((m) => m.role !== 'system'));
            } catch {
              // Keep optimistic UI if refresh fails
            }
          }
        },
        (err: Error) => {
          setIsLoading(false);
          setError(err.message);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && !last.content && !last.tool_calls?.length && !last.tool_results?.length) {
              return prev.slice(0, -1);
            }
            return prev;
          });
        },
        controller.signal,
        (toolCall: ToolCallEvent) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = { ...last, tool_calls: [...(last.tool_calls || []), toolCall] };
            }
            return updated;
          });
        },
        (toolResult: ToolResultEvent) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              const updatedCalls = (last.tool_calls || []).map((tc) =>
                tc.id === toolResult.tool_call_id ? { ...tc, status: toolResult.status as ToolCallEvent['status'] } : tc,
              );
              updated[updated.length - 1] = {
                ...last,
                tool_calls: updatedCalls,
                tool_results: [...(last.tool_results || []), toolResult],
              };
            }
            return updated;
          });
        },
        (sid: string) => {
          setSessionId(sid);
          if (storageKeyValue) localStorage.setItem(storageKeyValue, sid);
        },
      );
    },
    [messages, isLoading, effectiveContext, sessionId, storageKeyValue],
  );

  const togglePanel = React.useCallback(() => setIsOpen((v) => !v), []);
  const openPanel = React.useCallback(() => setIsOpen(true), []);
  const closePanel = React.useCallback(() => setIsOpen(false), []);
  const clearMessages = React.useCallback(() => {
    const sid = sessionId;
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setSessionId(null);
    if (storageKeyValue) localStorage.removeItem(storageKeyValue);
    if (sid) {
      deleteChatSession(sid).catch(() => undefined);
    }
  }, [sessionId, storageKeyValue]);

  const value = React.useMemo<ChatContextValue>(
    () => ({
      messages,
      isLoading,
      isOpen,
      context,
      error,
      sessionId,
      sendMessage,
      togglePanel,
      openPanel,
      closePanel,
      setContext,
      clearMessages,
    }),
    [messages, isLoading, isOpen, context, error, sessionId, sendMessage, togglePanel, openPanel, closePanel, clearMessages],
  );

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}
