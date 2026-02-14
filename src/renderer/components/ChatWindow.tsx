import React, { useState, useRef, useEffect } from 'react';
import { AnnotatedStep, RecordedStep } from '../../main/preload';
import { useChat, useMessageFormatting } from '../hooks/useChat';
import { X, Send, MessageCircle, RotateCcw, Check } from 'lucide-react';

interface ChatWindowProps {
  steps: any[];
  onClose: () => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ steps, onClose }) => {
  const {
    messages,
    isLoading,
    isStreaming,
    error,
    includeRecordingContext,
    sendMessage,
    toggleRecordingContext,
    clearChat,
  } = useChat();
  
  const { formatTimestamp, isCodeMessage } = useMessageFormatting();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when window opens
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle message send
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const message = inputValue.trim();
    setInputValue('');

    try {
      const recordingSteps = includeRecordingContext ? steps.map(step => ({
        stepNumber: step.stepNumber,
        timestamp: step.timestamp,
        actionType: step.actionType,
        windowTitle: step.windowTitle,
        description: step.description,
        screenshotPath: step.screenshotPath,
        globalMousePosition: step.globalMousePosition,
        relativeMousePosition: step.relativeMousePosition,
        windowSize: step.windowSize,
        screenshotRelativeMousePosition: step.screenshotRelativeMousePosition,
        screenshotSize: step.screenshotSize,
        textTyped: step.textTyped,
        scrollDelta: step.scrollDelta,
        elementName: step.elementName,
      })) : undefined;

      await sendMessage(message, recordingSteps);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card rounded-lg border shadow-lg w-full max-w-2xl h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <MessageCircle className="h-5 w-5" />
            <div>
              <h2 className="font-semibold">Ondoki Chat</h2>
              {includeRecordingContext && steps.length > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <Check className="h-3 w-3 text-green-600" />
                  <span className="text-xs text-green-600">
                    Including {steps.length} recorded steps
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Include recording context toggle */}
            <label className="flex items-center space-x-2 text-sm">
              <input
                type="checkbox"
                checked={includeRecordingContext}
                onChange={toggleRecordingContext}
                className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
              />
              <span className="text-foreground">Include recording</span>
            </label>

            <button
              onClick={onClose}
              className="btn-ghost h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-12">
              <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Start a conversation</h3>
              <p className="text-small max-w-sm">
                Ask questions about your recording or get help with your workflow.
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-3 py-2 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <div className={`text-sm whitespace-pre-wrap ${
                  isCodeMessage(message.content) ? 'font-mono text-xs' : ''
                }`}>
                  {message.content}
                </div>
                <div className="text-xs mt-1 opacity-70">
                  {formatTimestamp(message.timestamp || new Date())}
                </div>
              </div>
            </div>
          ))}

          {/* Streaming indicator */}
          {isStreaming && (
            <div className="flex justify-start">
              <div className="bg-muted text-muted-foreground rounded-lg px-3 py-2 max-w-xs lg:max-w-md">
                <div className="flex items-center space-x-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span className="text-xs">AI is typing...</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <div className="h-4 w-4 rounded-full bg-destructive flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-destructive">Error</p>
                  <p className="text-xs text-destructive/80">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t p-4">
          <div className="flex space-x-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="input-field resize-none"
                rows={1}
                style={{
                  minHeight: '40px',
                  maxHeight: '100px',
                  overflow: 'auto',
                }}
                disabled={isLoading}
              />
              
              {/* Character limit indicator */}
              {inputValue.length > 500 && (
                <div className="absolute bottom-1 right-1 text-xs text-muted-foreground">
                  {inputValue.length}/1000
                </div>
              )}
            </div>

            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              className="btn-primary h-10 w-10 p-0"
              title="Send message (Enter)"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Quick actions */}
          {messages.length > 0 && (
            <div className="flex justify-between items-center mt-3">
              <button
                onClick={clearChat}
                className="btn-ghost text-xs h-auto p-1"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Clear chat
              </button>
              
              <div className="text-xs text-muted-foreground">
                Press Enter to send, Shift+Enter for new line
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;