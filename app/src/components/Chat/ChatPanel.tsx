import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Brain, Wrench, X, MessageCircle, Plus, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useChat } from './ChatContext';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { deleteChatSession } from '@/api/chat';

function formatWhen(date?: string) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ChatPanel() {
  const { user } = useAuth();
  if (!user) return null;

  const navigate = useNavigate();
  const {
    messages,
    sessions,
    isLoading,
    isOpen,
    togglePanel,
    closePanel,
    context,
    error,
    sendMessage,
    clearMessages,
    sessionId,
    selectSession,
    refreshSessions,
    regenerateFromMessage,
    deleteMessage,
  } = useChat();

  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent).detail;
      if (typeof url === 'string') navigate(url);
    };
    window.addEventListener('stept-navigate', handler);
    return () => window.removeEventListener('stept-navigate', handler);
  }, [navigate]);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const contextLabel = React.useMemo(() => {
    if (!context) return null;
    if (context.recording_id) return 'Workflow';
    if (context.document_id) return 'Document';
    return null;
  }, [context]);

  const handleDeleteSession = React.useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteChatSession(id);
    if (id === sessionId) clearMessages();
    await refreshSessions();
  }, [sessionId, clearMessages, refreshSessions]);

  return (
    <>
      {!isOpen && (
        <button
          onClick={togglePanel}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
          title="Open AI Chat"
        >
          <MessageCircle className="h-6 w-6" />
          {messages.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {messages.filter((m) => m.role === 'assistant').length}
            </span>
          )}
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[680px] w-[820px] overflow-hidden rounded-2xl border bg-background shadow-2xl">
          <div className="flex w-[250px] shrink-0 flex-col border-r bg-muted/20">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Chats</span>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearMessages} title="New chat">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {sessions.length === 0 ? (
                <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  No saved chats yet.
                </div>
              ) : (
                <div className="space-y-1">
                  {sessions.map((session) => (
                    <button
                      key={session.id}
                      onClick={() => void selectSession(session.id)}
                      className={cn(
                        'group w-full rounded-lg border px-3 py-2 text-left transition-colors',
                        session.id === sessionId ? 'border-primary bg-primary/5' : 'border-transparent hover:border-border hover:bg-accent/40',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {session.title || 'Untitled chat'}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {formatWhen(session.updated_at)}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={(e) => void handleDeleteSession(session.id, e)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold">AI Chat</span>
                {contextLabel && (
                  <Badge variant="secondary" className="text-xs">
                    {contextLabel}
                  </Badge>
                )}
                {sessionId && (
                  <Badge variant="outline" className="text-[10px]">
                    Saved
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearMessages}
                  disabled={messages.length === 0}
                  title="New chat"
                  aria-label="New chat"
                  className="h-7 w-7"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closePanel}
                  aria-label="Close chat"
                  className="h-7 w-7"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              <div className="flex flex-col gap-3 p-4">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
                    <Brain className="h-8 w-8 opacity-40" />
                    <p className="text-sm">
                      Ask me anything about your {contextLabel?.toLowerCase() || 'work'}.
                    </p>
                    <div className="flex items-center gap-1.5 text-xs opacity-50">
                      <Wrench className="h-3 w-3" />
                      <span>I can search, analyze, and help manage your content.</span>
                    </div>
                  </div>
                )}
                {messages.filter((m) => m.role !== 'system').map((msg, i) => (
                  <ChatMessage
                    key={msg.id || i}
                    message={msg}
                    onRetry={msg.role === 'assistant' ? regenerateFromMessage : undefined}
                    onDelete={msg.id ? (id) => void deleteMessage(id) : undefined}
                  />
                ))}
              </div>
            </div>

            {error && (
              <div className="mx-3 mb-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <ChatInput onSend={sendMessage} disabled={isLoading} />
          </div>
        </div>
      )}
    </>
  );
}
