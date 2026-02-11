/**
 * Inline AI API client for TipTap editor commands.
 * Streams SSE responses from the /chat/inline endpoint.
 */

import { getApiBaseUrl } from '@/lib/apiClient';

export type AICommand =
  | 'write'
  | 'summarize'
  | 'improve'
  | 'expand'
  | 'simplify'
  | 'translate'
  | 'explain';

export interface InlineAIRequest {
  command: AICommand;
  prompt?: string;
  context?: string;
  language?: string;
}

/**
 * Stream an inline AI completion.
 * Calls onChunk for each text fragment, onDone when complete.
 */
export async function streamInlineAI(
  request: InlineAIRequest,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: Error) => void,
  signal?: AbortSignal,
): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/chat/inline`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
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
