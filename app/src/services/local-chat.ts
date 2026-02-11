/**
 * Local chat routing — decides whether to use the remote backend or
 * a locally running provider (Ollama, future local options).
 *
 * Currently supports:
 *   - Remote providers (openai, anthropic, copilot, custom) → backend API
 *   - Ollama → backend API (proxied through backend for auth + tool calls)
 *
 * WebLLM (browser-side inference) was removed — WebGPU is too experimental
 * and the package is not production-grade yet.
 */

const PROVIDER_STORAGE_KEY = 'ondoki_llm_provider';

export interface LocalProviderConfig {
  provider: string;
}

export function getLocalProviderConfig(): LocalProviderConfig {
  const provider = localStorage.getItem(PROVIDER_STORAGE_KEY) || '';
  return { provider };
}

export function setLocalProviderConfig(config: LocalProviderConfig): void {
  if (config.provider) {
    localStorage.setItem(PROVIDER_STORAGE_KEY, config.provider);
  } else {
    localStorage.removeItem(PROVIDER_STORAGE_KEY);
  }
}

/** Returns true if the current provider requires local (non-backend) handling. */
export function isLocalProvider(): boolean {
  // All providers currently route through the backend.
  // This hook exists for future local-only providers.
  return false;
}
