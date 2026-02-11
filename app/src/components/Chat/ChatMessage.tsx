/**
 * Single chat message bubble — user or assistant.
 * Renders markdown-like formatting (bold, code, lists) without heavy deps.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { ChatMessage as ChatMessageType } from '@/api/chat';

interface ChatMessageProps {
  message: ChatMessageType;
}

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
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((seg, i) => {
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

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex w-full',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
        )}
      >
        {renderContent(message.content)}
        {/* Blinking cursor when streaming */}
        {!isUser && message.content === '' && (
          <span className="inline-block h-4 w-1 animate-pulse bg-foreground/60" />
        )}
      </div>
    </div>
  );
}
