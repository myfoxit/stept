/**
 * WebLLM service — runs LLM inference in the browser via WebGPU.
 *
 * Uses @mlc-ai/web-llm which compiles models to WebGPU and caches them
 * in IndexedDB so they're only downloaded once.
 *
 * The import is DYNAMIC so the app still builds/runs even when
 * @mlc-ai/web-llm isn't installed — it only loads when actually used.
 */

// Dynamic import — lazily loads the heavy WebLLM package on first use
async function loadWebLLM() {
  return await import('@mlc-ai/web-llm');
}

// ── Model catalogue ──────────────────────────────────────────────────────────

export interface WebLLMModel {
  id: string;
  label: string;
  description: string;
  sizeHint: string; // human-readable
  sizeBytes: number; // approximate download size
}

export const WEBLLM_MODELS: WebLLMModel[] = [
  {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    label: 'Phi-3.5 Mini',
    description: 'Microsoft Phi-3.5 — fast, capable, recommended default',
    sizeHint: '~2.1 GB',
    sizeBytes: 2_100_000_000,
  },
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen 2.5 0.5B',
    description: 'Alibaba Qwen — tiny model for low-end devices',
    sizeHint: '~350 MB',
    sizeBytes: 350_000_000,
  },
];

export const DEFAULT_MODEL = WEBLLM_MODELS[0].id;

// ── WebGPU compatibility check ───────────────────────────────────────────────

export async function checkWebGPUSupport(): Promise<{
  supported: boolean;
  reason?: string;
}> {
  if (typeof navigator === 'undefined') {
    return { supported: false, reason: 'Not running in a browser' };
  }
  if (!('gpu' in navigator)) {
    return {
      supported: false,
      reason:
        'WebGPU is not available in this browser. Try Chrome 113+ or Edge 113+.',
    };
  }
  try {
    const adapter = await (navigator as unknown as { gpu: { requestAdapter: () => Promise<unknown | null> } }).gpu.requestAdapter();
    if (!adapter) {
      return {
        supported: false,
        reason:
          'WebGPU adapter not found. Your GPU may not be supported.',
      };
    }
    return { supported: true };
  } catch (e) {
    return {
      supported: false,
      reason: `WebGPU check failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ── Progress callback type ───────────────────────────────────────────────────

export interface WebLLMProgress {
  /** 0-1 normalised progress */
  progress: number;
  /** Human-readable status text from WebLLM */
  text: string;
  /** Estimated downloaded bytes (may be approximate) */
  downloadedBytes?: number;
  /** Total bytes (may be approximate) */
  totalBytes?: number;
}

export type ProgressCallback = (progress: WebLLMProgress) => void;

// ── Singleton engine management ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _engine: any = null;
let _loadedModel: string | null = null;
let _loading = false;

/**
 * Get or create the WebLLM engine for the given model.
 * The engine is cached — calling this twice with the same model is cheap.
 */
export async function getEngine(
  modelId: string = DEFAULT_MODEL,
  onProgress?: ProgressCallback,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  // Already loaded with same model
  if (_engine && _loadedModel === modelId) return _engine;

  // If currently loading, wait a bit and retry (simple debounce)
  if (_loading) {
    await new Promise((r) => setTimeout(r, 500));
    if (_engine && _loadedModel === modelId) return _engine;
    throw new Error('Another model is currently loading');
  }

  _loading = true;

  try {
    // Unload previous engine if model changed
    if (_engine && _loadedModel !== modelId) {
      await _engine.unload();
      _engine = null;
      _loadedModel = null;
    }

    const webllm = await loadWebLLM();

    const progressHandler = (report: { progress: number; text: string }) => {
      onProgress?.({
        progress: report.progress,
        text: report.text,
      });
    };

    _engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: progressHandler,
    });
    _loadedModel = modelId;
    return _engine;
  } finally {
    _loading = false;
  }
}

/** Check whether an engine is currently loaded. */
export function isEngineLoaded(): boolean {
  return _engine !== null;
}

/** Get the currently loaded model id, or null. */
export function getLoadedModel(): string | null {
  return _loadedModel;
}

/** Unload the engine and free GPU memory. */
export async function unloadEngine(): Promise<void> {
  if (_engine) {
    await _engine.unload();
    _engine = null;
    _loadedModel = null;
  }
}

/** Check whether a model is already in the browser cache. */
export async function isModelCached(modelId: string): Promise<boolean> {
  try {
    // web-llm stores model weights in Cache API
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      return cacheKeys.some((key) => key.includes(modelId) || key.includes('webllm'));
    }
    return false;
  } catch {
    return false;
  }
}

// ── Chat completion (streaming) ──────────────────────────────────────────────

export interface LocalChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Stream a chat completion from the local WebLLM engine.
 * Matches the OpenAI streaming format (delta chunks).
 */
export async function streamLocalCompletion(
  messages: LocalChatMessage[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: Error) => void,
  signal?: AbortSignal,
  modelId?: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  try {
    const engine = await getEngine(modelId, onProgress);

    if (signal?.aborted) {
      onDone();
      return;
    }

    const openaiMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const stream = await engine.chat.completions.create({
      messages: openaiMessages,
      stream: true,
      temperature: 0.7,
      max_tokens: 2048,
    });

    for await (const chunk of stream) {
      if (signal?.aborted) {
        onDone();
        return;
      }
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        onChunk(delta);
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
