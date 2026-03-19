/**
 * Chat / LLM API client with SSE streaming support.
 * Supports tool/function calling events inline in the stream.
 */

import { apiClient, getApiBaseUrl } from '@/lib/apiClient';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id?: string;
  session_id?: string;
  parent_message_id?: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: ToolCallEvent[];
  tool_results?: ToolResultEvent[];
  created_at?: string;
  deleted_at?: string | null;
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
  session_id?: string;
  parent_message_id?: string;
}

export interface ChatSession {
  id: string;
  title?: string | null;
  project_id?: string | null;
  recording_id?: string | null;
  document_id?: string | null;
  latest_message_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionDetail {
  session: ChatSession;
  messages: ChatMessage[];
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
  onSessionId?: (sessionId: string) => void,
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

    const sessionId = response.headers?.get?.('X-Chat-Session-Id');
    if (sessionId && onSessionId) onSessionId(sessionId);

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


export async function fetchChatSessions(projectId?: string): Promise<ChatSession[]> {
  const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
  const { data } = await apiClient.get<{ sessions: ChatSession[] }>(`/chat/sessions${query}`);
  return data.sessions;
}

export async function fetchChatSession(sessionId: string): Promise<ChatSessionDetail> {
  const { data } = await apiClient.get<ChatSessionDetail>(`/chat/sessions/${sessionId}`);
  return data;
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await apiClient.delete(`/chat/sessions/${sessionId}`);
}
