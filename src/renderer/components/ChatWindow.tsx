import React, { useState, useRef, useEffect } from 'react';
import { AnnotatedStep, RecordedStep } from '../../main/preload';
import { useChat, useMessageFormatting } from '../hooks/useChat';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">💬</span>
            <div>
              <h2 className="font-semibold text-gray-900">Ondoki Chat</h2>
              {includeRecordingContext && steps.length > 0 && (
                <p className="text-xs text-indigo-600">
                  Including {steps.length} recorded steps
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Include recording context toggle */}
            <label className="flex items-center space-x-2 text-sm">
              <input
                type="checkbox"
                checked={includeRecordingContext}
                onChange={toggleRecordingContext}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-gray-700">Include recording</span>
            </label>

            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              <div className="text-4xl mb-4">💬</div>
              <p>Start a conversation!</p>
              <p className="text-sm text-gray-400 mt-2">
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
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                  message.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                }`}
              >
                <div className={`text-sm whitespace-pre-wrap ${
                  isCodeMessage(message.content) ? 'font-mono text-xs' : ''
                }`}>
                  {message.content}
                </div>
                <div className={`text-xs mt-1 opacity-70 ${
                  message.role === 'user' ? 'text-indigo-200' : 'text-gray-500'
                }`}>
                  {formatTimestamp(message.timestamp || new Date())}
                </div>
              </div>
            </div>
          ))}

          {/* Streaming indicator */}
          {isStreaming && (
            <div className="flex justify-start">
              <div className="bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm px-4 py-2 max-w-xs lg:max-w-md">
                <div className="flex items-center space-x-1">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span className="text-xs text-gray-500 ml-2">AI is typing...</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <span className="text-red-500">⚠️</span>
                <div>
                  <p className="text-sm font-medium text-red-800">Error</p>
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex space-x-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
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
                <div className="absolute bottom-1 right-1 text-xs text-gray-400">
                  {inputValue.length}/1000
                </div>
              )}
            </div>

            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white p-2 rounded-lg transition-colors w-10 h-10 flex items-center justify-center"
              title="Send message (Enter)"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>📤</span>
              )}
            </button>
          </div>

          {/* Quick actions */}
          {messages.length > 0 && (
            <div className="flex justify-between items-center mt-2">
              <button
                onClick={clearChat}
                className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                Clear chat
              </button>
              
              <div className="text-xs text-gray-500">
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