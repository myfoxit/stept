import React, { useState, useRef, useEffect } from 'react';
import { AnnotatedStep, RecordedStep } from '../../main/preload';
import { useChat, useMessageFormatting } from '../hooks/useChat';
import { X, Send, MessageCircle, RotateCcw, Check, Loader2 } from 'lucide-react';

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
    <div className="dialog-overlay">
      <div className="bg-white rounded-lg shadow-xl border w-full max-w-lg h-[500px] flex flex-col">
        {/* Header */}
        <div className="px-3 py-2.5 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-gray-400" />
            <span className="text-[13px] font-semibold text-gray-800">Chat</span>
            {includeRecordingContext && steps.length > 0 && (
              <span className="text-[11px] text-green-500 flex items-center gap-0.5">
                <Check className="h-3 w-3" />{steps.length} steps
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
              <input type="checkbox" checked={includeRecordingContext} onChange={toggleRecordingContext}
                className="h-3 w-3 rounded border-gray-300 text-indigo-500" />
              Recording
            </label>
            <button onClick={onClose} className="btn-icon"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 scrollbar-thin">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageCircle className="h-8 w-8 text-gray-200 mb-2" />
              <p className="text-xs text-gray-400">Ask about your recording or workflow</p>
            </div>
          )}
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-2.5 py-1.5 rounded-lg text-[13px] ${
                message.role === 'user'
                  ? 'bg-indigo-500 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-700 rounded-bl-sm'
              }`}>
                <div className={`whitespace-pre-wrap ${isCodeMessage(message.content) ? 'font-mono text-xs' : ''}`}>
                  {message.content}
                </div>
                <div className="text-[10px] mt-0.5 opacity-60">{formatTimestamp(message.timestamp || new Date())}</div>
              </div>
            </div>
          ))}
          {isStreaming && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                <span className="text-[11px] text-gray-400">Typing...</span>
              </div>
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-600">{error}</div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t px-3 py-2">
          <div className="flex gap-1.5">
            <textarea ref={inputRef} value={inputValue} onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown} placeholder="Type a message..." rows={1}
              className="input-field flex-1 resize-none py-1.5" style={{ minHeight: '32px', maxHeight: '80px' }}
              disabled={isLoading} />
            <button onClick={handleSendMessage} disabled={!inputValue.trim() || isLoading}
              className="btn-primary h-8 w-8 p-0 flex-shrink-0">
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
          {messages.length > 0 && (
            <div className="flex justify-between items-center mt-1.5">
              <button onClick={clearChat} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
                <RotateCcw className="h-3 w-3" /> Clear
              </button>
              <span className="text-[11px] text-gray-300">Enter to send</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
