import React from 'react';
import { Sparkles, Send } from 'lucide-react';
import { theme } from './theme';
import type { ChatMessage } from './types';

interface ChatPanelProps {
  chatMessages: ChatMessage[];
  isChatLoading: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  chatMessages,
  isChatLoading,
  query,
  onQueryChange,
  onKeyDown,
  onSend,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <div
      style={{ padding: '10px 16px', maxHeight: 240, overflowY: 'auto' }}
      className="scrollbar-thin"
    >
      {chatMessages.length === 0 && !isChatLoading && (
        <div className="empty-state" style={{ padding: '16px 0' }}>
          Ask about your workflows, guides, or documents...
        </div>
      )}
      {chatMessages.map((msg, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            marginBottom: 8,
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            gap: msg.role === 'assistant' ? 8 : 0,
          }}
        >
          {msg.role === 'assistant' && (
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                flexShrink: 0,
                background: 'rgba(26,26,26,0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 2,
              }}
            >
              <Sparkles size={12} color={theme.dark} strokeWidth={2.5} />
            </div>
          )}
          <div
            style={{
              padding: '8px 12px',
              fontSize: 13,
              lineHeight: 1.5,
              maxWidth: '85%',
              borderRadius:
                msg.role === 'user' ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
              background: msg.role === 'user' ? theme.accent : theme.bg,
              color: msg.role === 'user' ? '#fff' : theme.dark,
              border:
                msg.role === 'assistant' ? `1px solid ${theme.border}` : 'none',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {msg.content}
          </div>
        </div>
      ))}
      {isChatLoading && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              flexShrink: 0,
              background: 'rgba(26,26,26,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 2,
            }}
          >
            <Sparkles size={12} color={theme.dark} strokeWidth={2.5} />
          </div>
          <div
            style={{
              padding: '8px 12px',
              fontSize: 13,
              borderRadius: '4px 14px 14px 14px',
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              color: theme.textMuted,
            }}
          >
            Thinking...
          </div>
        </div>
      )}
    </div>
    <div style={{ padding: '8px 16px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          border: `1.5px solid ${theme.border}`,
          borderRadius: theme.radius.md,
          background: theme.bg,
        }}
      >
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Follow up..."
          style={{
            flex: 1,
            border: 'none',
            background: 'none',
            fontSize: 13,
            fontFamily: theme.font.sans,
            color: theme.dark,
            outline: 'none',
          }}
        />
        <button
          onClick={onSend}
          disabled={!query.trim() || isChatLoading}
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            background: theme.dark,
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            opacity: !query.trim() || isChatLoading ? 0.5 : 1,
          }}
        >
          <Send size={11} color="#fff" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  </div>
);
