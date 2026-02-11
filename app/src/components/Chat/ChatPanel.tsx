/**
 * Slide-out chat panel (right side). Uses Sheet from shadcn/ui.
 * Can be toggled from any page via the ChatProvider.
 */

import * as React from 'react';
import { IconTrash, IconBrain, IconTool } from '@tabler/icons-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useChat } from './ChatContext';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

export function ChatPanel() {
  const {
    messages,
    isLoading,
    isOpen,
    closePanel,
    context,
    error,
    sendMessage,
    clearMessages,
  } = useChat();

  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const contextLabel = React.useMemo(() => {
    if (!context) return null;
    if (context.recording_id) return 'Workflow';
    if (context.document_id) return 'Document';
    return null;
  }, [context]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closePanel()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconBrain className="h-5 w-5 text-primary" />
              <SheetTitle className="text-base">AI Chat</SheetTitle>
              {contextLabel && (
                <Badge variant="secondary" className="text-xs">
                  {contextLabel}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={clearMessages}
              disabled={messages.length === 0}
              title="Clear chat"
              className="h-8 w-8"
            >
              <IconTrash className="h-4 w-4" />
            </Button>
          </div>
          <SheetDescription className="sr-only">
            AI chat assistant for your workflows and documents
          </SheetDescription>
        </SheetHeader>

        {/* Messages area */}
        <ScrollArea className="flex-1 overflow-y-auto">
          <div ref={scrollRef} className="flex flex-col gap-3 p-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
                <IconBrain className="h-10 w-10 opacity-40" />
                <p className="text-sm">
                  Ask me anything about your{' '}
                  {contextLabel?.toLowerCase() || 'work'}.
                </p>
                <p className="text-xs opacity-60">
                  I can help you understand, summarise, or improve your content.
                </p>
                <div className="flex items-center gap-1.5 text-xs opacity-50">
                  <IconTool className="h-3 w-3" />
                  <span>
                    I can also create pages, analyze workflows, and more.
                  </span>
                </div>
              </div>
            )}
            {messages
              .filter((m) => m.role !== 'system')
              .map((msg, i) => (
                <ChatMessage key={i} message={msg} />
              ))}
          </div>
        </ScrollArea>

        {/* Error display */}
        {error && (
          <div className="mx-4 mb-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Input */}
        <ChatInput onSend={sendMessage} disabled={isLoading} />
      </SheetContent>
    </Sheet>
  );
}
