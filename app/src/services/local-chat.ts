/**
 * Local chat routing — decides whether to use local (WebLLM) or remote
 * (backend API) for chat completions based on the active provider.
 *
 * When provider is "webllm" → runs inference in the browser.
 * For all other providers → delegates to the backend as usual.
 *
 * Tool calls from a local LLM are forwarded to the backend for execution,
 * then results are fed back into the local LLM.
 */

import type {
  ChatMessage,
  ChatCompletionRequest,
  ToolCallEvent,
  ToolResultEvent,
} from '@/api/chat';
import { streamChatCompletion as remoteStreamChatCompletion } from '@/api/chat';
import {
  streamLocalCompletion,
  type LocalChatMessage,
  type ProgressCallback,
} from '@/services/webllm';

// ── Provider state (stored in localStorage) ──────────────────────────────────

const STORAGE_KEY = 'ondoki_llm_provider';
const MODEL_STORAGE_KEY = 'ondoki_webllm_model';

export interface LocalProviderConfig {
  provider: string;
  webllmModel?: string;
}

export function getLocalProviderConfig(): LocalProviderConfig {
  const provider = localStorage.getItem(STORAGE_KEY) || '';
  const webllmModel = localStorage.getItem(MODEL_STORAGE_KEY) || undefined;
  return { provider, webllmModel };
}

export function setLocalProviderConfig(config: LocalProviderConfig): void {
  localStorage.setItem(STORAGE_KEY, config.provider);
  if (config.webllmModel) {
    localStorage.setItem(MODEL_STORAGE_KEY, config.webllmModel);
  }
}

export function clearLocalProviderConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(MODEL_STORAGE_KEY);
}

export function isLocalProvider(): boolean {
  return getLocalProviderConfig().provider === 'webllm';
}

// ── Unified streaming function ───────────────────────────────────────────────

/**
 * Stream a chat completion, routing to local or remote automatically.
 * Drop-in replacement for the original `streamChatCompletion` from chat.ts.
 */
export async function routedStreamChatCompletion(
  request: ChatCompletionRequest,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: Error) => void,
  signal?: AbortSignal,
  onToolCall?: (toolCall: ToolCallEvent) => void,
  onToolResult?: (toolResult: ToolResultEvent) => void,
  onProgress?: ProgressCallback,
): Promise<void> {
  const config = getLocalProviderConfig();

  if (config.provider === 'webllm') {
    // ── Local WebLLM path ──────────────────────────────────────────────

    const localMessages: LocalChatMessage[] = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    return streamLocalCompletion(
      localMessages,
      onChunk,
      onDone,
      onError,
      signal,
      config.webllmModel,
      onProgress,
    );
  }

  // ── Remote backend path (default) ──────────────────────────────────────
  return remoteStreamChatCompletion(
    request,
    onChunk,
    onDone,
    onError,
    signal,
    onToolCall,
    onToolResult,
  );
}
