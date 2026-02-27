import React from 'react';
import { Sparkles, Send } from 'lucide-react';
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
  <div className="chat-panel">
    <div className="chat-messages scrollbar-thin">
      {chatMessages.length === 0 && !isChatLoading && (
        <div className="empty-state chat-empty">
          Ask about your workflows, guides, or documents...
        </div>
      )}
      {chatMessages.map((msg, i) => (
        <div key={i} className={`chat-msg chat-msg--${msg.role}`}>
          {msg.role === 'assistant' && (
            <div className="chat-avatar">
              <Sparkles size={12} strokeWidth={2.5} />
            </div>
          )}
          <div className={`chat-bubble chat-bubble--${msg.role}`}>
            {msg.content}
          </div>
        </div>
      ))}
      {isChatLoading && (
        <div className="chat-msg--loading">
          <div className="chat-avatar">
            <Sparkles size={12} strokeWidth={2.5} />
          </div>
          <div className="chat-bubble--loading">Thinking...</div>
        </div>
      )}
    </div>
    <div className="chat-input-area">
      <div className="chat-input-wrapper">
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Follow up..."
          className="chat-input"
        />
        <button
          onClick={onSend}
          disabled={!query.trim() || isChatLoading}
          className="chat-send-btn"
        >
          <Send size={11} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  </div>
);
