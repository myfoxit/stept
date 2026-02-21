import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { IconTrash, IconBrain, IconTool, IconX, IconMessageCircle } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useChat } from './ChatContext';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { cn } from '@/lib/utils';

export function ChatPanel() {
  const navigate = useNavigate();
  const {
    messages,
    isLoading,
    isOpen,
    togglePanel,
    closePanel,
    context,
    error,
    sendMessage,
    clearMessages,
  } = useChat();

  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Handle internal link navigation from chat messages
  React.useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent).detail;
      if (typeof url === 'string') navigate(url);
    };
    window.addEventListener('ondoki-navigate', handler);
    return () => window.removeEventListener('ondoki-navigate', handler);
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

  return (
    <>
      {/* Floating chat bubble trigger */}
      {!isOpen && (
        <button
          onClick={togglePanel}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
          title="Open AI Chat"
        >
          <IconMessageCircle className="h-6 w-6" />
          {messages.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {messages.filter(m => m.role === 'assistant').length}
            </span>
          )}
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[680px] w-[480px] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <IconBrain className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold">AI Chat</span>
              {contextLabel && (
                <Badge variant="secondary" className="text-xs">
                  {contextLabel}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={clearMessages}
                disabled={messages.length === 0}
                title="Clear chat"
                className="h-7 w-7"
              >
                <IconTrash className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={closePanel}
                className="h-7 w-7"
              >
                <IconX className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-3 p-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
                  <IconBrain className="h-8 w-8 opacity-40" />
                  <p className="text-sm">
                    Ask me anything about your{' '}
                    {contextLabel?.toLowerCase() || 'work'}.
                  </p>
                  <div className="flex items-center gap-1.5 text-xs opacity-50">
                    <IconTool className="h-3 w-3" />
                    <span>I can search, analyze, and help manage your content.</span>
                  </div>
                </div>
              )}
              {messages
                .filter((m) => m.role !== 'system')
                .map((msg, i) => (
                  <ChatMessage key={i} message={msg} />
                ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mx-3 mb-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Input */}
          <ChatInput onSend={sendMessage} disabled={isLoading} />
        </div>
      )}
    </>
  );
}
