/**
 * Chat / LLM API client with SSE streaming support.
 */

import { apiClient, getApiBaseUrl } from '@/lib/apiClient';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatContext {
  recording_id?: string;
  document_id?: string;
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
  dataveil_enabled: boolean;
  configured: boolean;
}

// ── SSE Streaming ────────────────────────────────────────────────────────────

export async function streamChatCompletion(
  request: ChatCompletionRequest,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: Error) => void,
  signal?: AbortSignal,
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
