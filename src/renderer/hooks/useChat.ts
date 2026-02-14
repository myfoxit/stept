import { useState, useCallback, useRef } from 'react';
import { ChatMessage, RecordedStep } from '../../main/preload';
import { useElectronAPI } from './useElectronAPI';

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  includeRecordingContext: boolean;
}

/**
 * Custom hook for chat state management
 */
export const useChat = () => {
  const electronAPI = useElectronAPI();
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    isStreaming: false,
    error: null,
    includeRecordingContext: false,
  });

  const streamingMessageRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Add a message to the chat
  const addMessage = useCallback((message: ChatMessage) => {
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, {
        ...message,
        timestamp: message.timestamp || new Date(),
      }],
    }));
  }, []);

  // Update the last message (for streaming)
  const updateLastMessage = useCallback((content: string) => {
    setState(prev => ({
      ...prev,
      messages: prev.messages.map((msg, index) =>
        index === prev.messages.length - 1
          ? { ...msg, content }
          : msg
      ),
    }));
  }, []);

  // Send a chat message
  const sendMessage = useCallback(async (
    content: string,
    recordingSteps?: RecordedStep[]
  ) => {
    if (!electronAPI) {
      throw new Error('Electron API not available');
    }

    if (!content.trim()) {
      throw new Error('Message content cannot be empty');
    }

    try {
      // Add user message
      const userMessage: ChatMessage = {
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };
      addMessage(userMessage);

      setState(prev => ({ ...prev, isLoading: true, isStreaming: true, error: null }));

      // Prepare messages for the API
      const messages = [...state.messages, userMessage];

      // Prepare context from recording steps if enabled
      let context: string | undefined;
      if (state.includeRecordingContext && recordingSteps && recordingSteps.length > 0) {
        context = JSON.stringify(recordingSteps.map(step => ({
          stepNumber: step.stepNumber,
          actionType: step.actionType,
          description: step.description,
          windowTitle: step.windowTitle,
          timestamp: step.timestamp,
        })));
      }

      // Create abort controller for potential cancellation
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Add placeholder assistant message
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };
      addMessage(assistantMessage);

      // Start streaming response
      streamingMessageRef.current = '';
      
      // Note: In a real implementation, you might want to implement SSE streaming
      // For now, we'll use the regular API and simulate streaming
      const response = await electronAPI.sendChatMessage(messages, context);

      if (!abortController.signal.aborted) {
        // Simulate streaming by gradually revealing the response
        await simulateStreaming(response);
      }

      setState(prev => ({ ...prev, isLoading: false, isStreaming: false }));
      abortControllerRef.current = null;

    } catch (error) {
      console.error('Failed to send chat message:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        isStreaming: false,
        error: error instanceof Error ? error.message : 'Failed to send message',
      }));
      
      // Remove the last assistant message if it was empty due to error
      setState(prev => ({
        ...prev,
        messages: prev.messages.filter(msg => 
          !(msg.role === 'assistant' && msg.content === '')
        ),
      }));
      
      throw error;
    }
  }, [electronAPI, addMessage, state.messages, state.includeRecordingContext]);

  // Simulate streaming effect for better UX
  const simulateStreaming = useCallback(async (fullResponse: string) => {
    const words = fullResponse.split(' ');
    streamingMessageRef.current = '';

    for (let i = 0; i < words.length; i++) {
      if (abortControllerRef.current?.signal.aborted) {
        break;
      }

      streamingMessageRef.current += (i > 0 ? ' ' : '') + words[i];
      updateLastMessage(streamingMessageRef.current);
      
      // Add a small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }, [updateLastMessage]);

  // Cancel streaming
  const cancelStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setState(prev => ({ ...prev, isStreaming: false, isLoading: false }));
    }
  }, []);

  // Toggle recording context inclusion
  const toggleRecordingContext = useCallback(() => {
    setState(prev => ({
      ...prev,
      includeRecordingContext: !prev.includeRecordingContext,
    }));
  }, []);

  // Clear chat history
  const clearChat = useCallback(() => {
    setState(prev => ({
      ...prev,
      messages: [],
      error: null,
    }));
  }, []);

  // Generate guide from recording steps
  const generateGuide = useCallback(async (steps: RecordedStep[]) => {
    if (!electronAPI) {
      throw new Error('Electron API not available');
    }

    if (!steps || steps.length === 0) {
      throw new Error('No recording steps available');
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const guide = await electronAPI.generateGuide(steps);

      // Add the generated guide as an assistant message
      const guideMessage: ChatMessage = {
        role: 'assistant',
        content: `## Generated Guide\n\n${guide}`,
        timestamp: new Date(),
      };
      addMessage(guideMessage);

      setState(prev => ({ ...prev, isLoading: false }));
      return guide;

    } catch (error) {
      console.error('Failed to generate guide:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate guide';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      throw new Error(errorMessage);
    }
  }, [electronAPI, addMessage]);

  // Get last few messages for context
  const getRecentMessages = useCallback((count: number = 10) => {
    return state.messages.slice(-count);
  }, [state.messages]);

  // Get message count
  const messageCount = state.messages.length;
  const hasMessages = messageCount > 0;

  return {
    // State
    messages: state.messages,
    isLoading: state.isLoading,
    isStreaming: state.isStreaming,
    error: state.error,
    includeRecordingContext: state.includeRecordingContext,

    // Derived state
    messageCount,
    hasMessages,

    // Actions
    sendMessage,
    addMessage,
    cancelStreaming,
    toggleRecordingContext,
    clearChat,
    generateGuide,
    getRecentMessages,
  };
};

/**
 * Helper hook for message formatting
 */
export const useMessageFormatting = () => {
  // Format message timestamp
  const formatTimestamp = useCallback((timestamp: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(timestamp);
  }, []);

  // Check if message contains code
  const isCodeMessage = useCallback((content: string) => {
    return content.includes('```') || content.includes('`');
  }, []);

  // Format message content with basic markdown support
  const formatMessage = useCallback((content: string) => {
    // This is a simple implementation - you might want to use a proper markdown library
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }, []);

  return {
    formatTimestamp,
    isCodeMessage,
    formatMessage,
  };
};

export default useChat;