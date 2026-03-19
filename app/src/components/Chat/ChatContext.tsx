/**
 * React context for Chat state management.
 */

import * as React from 'react';
import type {
  ChatMessage,
  ChatContext as ChatContextPayload,
  ToolCallEvent,
  ToolResultEvent,
  ChatSession,
} from '@/api/chat';
import { streamChatCompletion, fetchChatSession, fetchChatSessions, deleteChatMessage } from '@/api/chat';
import { useProject } from '@/providers/project-provider';
import { useAuth } from '@/providers/auth-provider';

interface SendOptions {
  parentMessageId?: string;
  messagesOverride?: ChatMessage[];
}

interface ChatState {
  messages: ChatMessage[];
  sessions: ChatSession[];
  isLoading: boolean;
  isOpen: boolean;
  context: ChatContextPayload | null;
  error: string | null;
  sessionId: string | null;
}

interface ChatActions {
  sendMessage: (content: string, options?: SendOptions) => void;
  regenerateFromMessage: (messageId: string) => void;
  deleteMessage: (messageId: string) => Promise<void>;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  setContext: (ctx: ChatContextPayload | null) => void;
  clearMessages: () => void;
  selectSession: (id: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
}

type ChatContextValue = ChatState & ChatActions;

const ChatCtx = React.createContext<ChatContextValue | null>(null);
export function useChat(): ChatContextValue {
  const ctx = React.useContext(ChatCtx);
  if (!ctx) throw new Error('useChat must be used within a ChatProvider');
  return ctx;
}

function storageKey(userId?: string, projectId?: string | null): string | null {
  if (!userId) return null;
  return `stept_chat_session_${userId}_${projectId || 'global'}`;
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [sessions, setSessions] = React.useState<ChatSession[]>([]);
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

  const storageKeyValue = React.useMemo(() => storageKey(user?.id, selectedProjectId), [user?.id, selectedProjectId]);

  const selectSession = React.useCallback(async (id: string) => {
    const detail = await fetchChatSession(id);
    setSessionId(detail.session.id);
    setMessages(detail.messages.filter((m) => m.role !== 'system'));
    if (storageKeyValue) localStorage.setItem(storageKeyValue, detail.session.id);
  }, [storageKeyValue]);

  const refreshSessions = React.useCallback(async () => {
    const list = await fetchChatSessions(selectedProjectId || undefined);
    setSessions(list);
  }, [selectedProjectId]);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.id) return;
      try {
        const list = await fetchChatSessions(selectedProjectId || undefined);
        if (cancelled) return;
        setSessions(list);
        const stored = storageKeyValue ? localStorage.getItem(storageKeyValue) : null;
        const target = stored && list.some((s) => s.id === stored) ? stored : list[0]?.id || null;
        if (!target) {
          setSessionId(null);
          setMessages([]);
          return;
        }
        const detail = await fetchChatSession(target);
        if (cancelled) return;
        setSessionId(detail.session.id);
        setMessages(detail.messages.filter((m) => m.role !== 'system'));
        if (storageKeyValue) localStorage.setItem(storageKeyValue, detail.session.id);
      } catch {
        if (!cancelled) {
          setSessions([]);
          setSessionId(null);
          setMessages([]);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id, selectedProjectId, storageKeyValue]);

  const sendMessage = React.useCallback((content: string, options?: SendOptions) => {
    if (!content.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content };
    const assistantMessage: ChatMessage = { role: 'assistant', content: '', tool_calls: [], tool_results: [] };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);
    setError(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const sourceMessages = options?.messagesOverride || messages;
    const allMessages: ChatMessage[] = [...sourceMessages, userMessage].map((m) => ({ role: m.role, content: m.content }));
    const lastRealMessage = [...sourceMessages].reverse().find((m) => m.id);

    streamChatCompletion(
      {
        messages: allMessages,
        stream: true,
        context: effectiveContext,
        session_id: sessionId || undefined,
        parent_message_id: options?.parentMessageId || lastRealMessage?.id,
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
            const detail = await fetchChatSession(sid);
            setSessionId(detail.session.id);
            setMessages(detail.messages.filter((m) => m.role !== 'system'));
            await refreshSessions();
          } catch {}
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
  }, [messages, isLoading, effectiveContext, sessionId, storageKeyValue, refreshSessions]);

  const regenerateFromMessage = React.useCallback((messageId: string) => {
    const assistantIndex = messages.findIndex((m) => m.id === messageId);
    if (assistantIndex < 0) return;
    const assistant = messages[assistantIndex];
    if (assistant.role !== 'assistant') return;
    const userIndex = assistantIndex - 1;
    const userMessage = messages[userIndex];
    if (!userMessage || userMessage.role !== 'user') return;
    const baseMessages = messages.slice(0, userIndex);
    setMessages(baseMessages);
    sendMessage(userMessage.content, {
      parentMessageId: userMessage.parent_message_id || undefined,
      messagesOverride: baseMessages,
    });
  }, [messages, sendMessage]);

  const deleteMessage = React.useCallback(async (messageId: string) => {
    if (!sessionId) return;
    await deleteChatMessage(sessionId, messageId);
    const detail = await fetchChatSession(sessionId);
    setMessages(detail.messages.filter((m) => m.role !== 'system'));
    await refreshSessions();
  }, [sessionId, refreshSessions]);

  const togglePanel = React.useCallback(() => setIsOpen((v) => !v), []);
  const openPanel = React.useCallback(() => setIsOpen(true), []);
  const closePanel = React.useCallback(() => setIsOpen(false), []);
  const clearMessages = React.useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setSessionId(null);
    if (storageKeyValue) localStorage.removeItem(storageKeyValue);
  }, [storageKeyValue]);

  const value = React.useMemo<ChatContextValue>(() => ({
    messages,
    sessions,
    isLoading,
    isOpen,
    context,
    error,
    sessionId,
    sendMessage,
    regenerateFromMessage,
    deleteMessage,
    togglePanel,
    openPanel,
    closePanel,
    setContext,
    clearMessages,
    selectSession,
    refreshSessions,
  }), [messages, sessions, isLoading, isOpen, context, error, sessionId, sendMessage, regenerateFromMessage, deleteMessage, togglePanel, openPanel, closePanel, clearMessages, selectSession, refreshSessions]);

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}
