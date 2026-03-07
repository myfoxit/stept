/**
 * Chat / LLM API client with SSE streaming support.
 * Supports tool/function calling events inline in the stream.
 */

import { apiClient, getApiBaseUrl } from '@/lib/apiClient';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: ToolCallEvent[];
  tool_results?: ToolResultEvent[];
}

export interface ChatContext {
  recording_id?: string;
  document_id?: string;
  project_id?: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  context?: ChatContext;
}

export interface ChatModel {
  id: string;
  name: string;
}

export interface ChatConfig {
  provider: string;
  model: string;
  base_url: string | null;
  sendcloak_enabled: boolean;
  configured: boolean;
}

// ── Tool Calling Types ───────────────────────────────────────────────────────

export interface ToolCallEvent {
  id: string;
  name: string;
  arguments: string;
  status: 'executing' | 'completed' | 'error';
}

export interface ToolResultEvent {
  tool_call_id: string;
  result: Record<string, unknown>;
  status: 'completed' | 'error';
}

export interface ChatTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ── SSE Streaming ────────────────────────────────────────────────────────────

export async function streamChatCompletion(
  request: ChatCompletionRequest,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: Error) => void,
  signal?: AbortSignal,
  onToolCall?: (toolCall: ToolCallEvent) => void,
  onToolResult?: (toolResult: ToolResultEvent) => void,
): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/chat/completions`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...request, stream: true }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last (possibly incomplete) line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(data);

          // Handle tool call events
          if (parsed.tool_call && onToolCall) {
            onToolCall(parsed.tool_call);
            continue;
          }

          // Handle tool result events
          if (parsed.tool_result && onToolResult) {
            onToolResult(parsed.tool_result);
            continue;
          }

          // Handle regular text chunks
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            onChunk(content);
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    onDone();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      onDone();
      return;
    }
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// ── REST Endpoints ───────────────────────────────────────────────────────────

export async function fetchChatModels(): Promise<ChatModel[]> {
  const { data } = await apiClient.get<{ models: ChatModel[] }>('/chat/models');
  return data.models;
}

export async function fetchChatConfig(): Promise<ChatConfig> {
  const { data } = await apiClient.get<ChatConfig>('/chat/config');
  return data;
}

export interface ChatConfigUpdate {
  provider?: string;
  model?: string;
  base_url?: string;
  api_key?: string;
}

export async function updateChatConfig(config: ChatConfigUpdate): Promise<ChatConfig> {
  const { data } = await apiClient.put<ChatConfig>('/chat/config', config);
  return data;
}

export async function fetchChatTools(): Promise<ChatTool[]> {
  const { data } = await apiClient.get<{ tools: ChatTool[] }>('/chat/tools');
  return data.tools;
}
