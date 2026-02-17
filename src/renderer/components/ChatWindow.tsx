import React, { useState, useRef, useEffect } from 'react';
import { useChat, useMessageFormatting } from '../hooks/useChat';

interface ChatWindowProps {
  steps: any[];
  onClose: () => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ steps, onClose }) => {
  const { messages, isLoading, isStreaming, error, includeRecordingContext, sendMessage, toggleRecordingContext, clearChat } = useChat();
  const { formatTimestamp, isCodeMessage } = useMessageFormatting();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;
    const message = inputValue.trim();
    setInputValue('');
    try {
      const recordingSteps = includeRecordingContext ? steps.map(step => ({
        stepNumber: step.stepNumber, timestamp: step.timestamp, actionType: step.actionType,
        windowTitle: step.windowTitle, description: step.description, screenshotPath: step.screenshotPath,
        globalMousePosition: step.globalMousePosition, relativeMousePosition: step.relativeMousePosition,
        windowSize: step.windowSize, screenshotRelativeMousePosition: step.screenshotRelativeMousePosition,
        screenshotSize: step.screenshotSize, textTyped: step.textTyped, scrollDelta: step.scrollDelta,
        elementName: step.elementName,
      })) : undefined;
      await sendMessage(message, recordingSteps);
    } catch (error) { console.error('Failed to send message:', error); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  };

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--card)', borderRadius: 'var(--radius-xl)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.2)', width: 440, maxWidth: '92vw',
        height: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '0.92rem', fontWeight: 700, color: 'var(--dark)' }}>Chat</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeRecordingContext} onChange={toggleRecordingContext}
                style={{ width: 12, height: 12 }} />
              Recording
            </label>
            <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-secondary)',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }} className="scrollbar-thin">
          {messages.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8, opacity: 0.3 }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <p style={{ fontSize: '0.78rem' }}>Ask about your recording or workflow</p>
            </div>
          )}
          {messages.map((message, index) => (
            <div key={index} style={{ display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '80%', padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                fontSize: '0.82rem', lineHeight: 1.5,
                ...(message.role === 'user'
                  ? { background: 'var(--purple)', color: 'white', borderBottomRightRadius: 4 }
                  : { background: 'var(--bg)', color: 'var(--text-primary)', borderBottomLeftRadius: 4, border: '1px solid var(--border)' }),
              }}>
                <div style={{ whiteSpace: 'pre-wrap', fontFamily: isCodeMessage(message.content) ? 'monospace' : 'inherit', fontSize: isCodeMessage(message.content) ? '0.75rem' : undefined }}>
                  {message.content}
                </div>
                <div style={{ fontSize: '0.6rem', marginTop: 4, opacity: 0.6 }}>{formatTimestamp(message.timestamp || new Date())}</div>
              </div>
            </div>
          ))}
          {isStreaming && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Typing...</span>
              </div>
            </div>
          )}
          {error && (
            <div style={{ background: 'rgba(255,95,87,0.08)', border: '1px solid rgba(255,95,87,0.2)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: '0.72rem', color: 'var(--red)' }}>
              {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea ref={inputRef} value={inputValue} onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown} placeholder="Type a message..." rows={1}
              style={{
                flex: 1, resize: 'none', minHeight: 38, maxHeight: 80,
                padding: '9px 14px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)',
                fontFamily: "'DM Sans', sans-serif", fontSize: '0.82rem', color: 'var(--text-primary)',
                background: 'var(--card)', outline: 'none',
              }}
              disabled={isLoading}
              onFocus={(e) => e.target.style.borderColor = 'var(--purple)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
            />
            <button onClick={handleSendMessage} disabled={!inputValue.trim() || isLoading}
              style={{
                width: 38, height: 38, borderRadius: 'var(--radius-sm)', border: 'none',
                background: 'var(--purple)', color: 'white', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: !inputValue.trim() || isLoading ? 0.5 : 1, flexShrink: 0,
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          {messages.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <button className="btn-text" style={{ padding: '2px 6px', fontSize: '0.68rem' }} onClick={clearChat}>Clear</button>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Enter to send</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
