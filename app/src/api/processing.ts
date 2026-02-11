/**
 * AI Processing API client — auto-annotation, guide generation, step improvement.
 */

import { request, getApiBaseUrl } from '@/lib/apiClient';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProcessingStatus {
  recording_id: string;
  steps_annotated: number;
  total_steps: number;
  has_summary: boolean;
  is_processed: boolean;
}

export interface GuideResponse {
  recording_id: string;
  guide_markdown: string | null;
  generated_title: string | null;
}

export interface StepAnnotation {
  step_id: string;
  step_number: number;
  generated_title: string | null;
  generated_description: string | null;
  ui_element: string | null;
  step_category: string | null;
  is_annotated: boolean;
}

export interface AISummary {
  recording_id: string;
  generated_title: string | null;
  summary: string | null;
  tags: string[] | null;
  estimated_time: string | null;
  difficulty: string | null;
  is_processed: boolean;
  guide_markdown: string | null;
  steps: StepAnnotation[];
}

export interface SearchResult {
  type: 'recording';
  recording_id: string;
  name: string;
  name_highlighted: string;
  generated_title: string | null;
  generated_title_highlighted: string;
  summary: string | null;
  summary_highlighted: string;
  tags: string[] | null;
  is_processed: boolean;
  matching_steps: Array<{
    step_id: string;
    step_number: number;
    description: string | null;
    description_highlighted: string;
    generated_title: string | null;
    generated_title_highlighted: string;
    window_title: string | null;
  }>;
}

export interface SearchResponse {
  query: string;
  total_results: number;
  results: SearchResult[];
}

// ── API Functions ────────────────────────────────────────────────────────────

/** Trigger full AI processing (annotate all steps + generate summary) */
export async function processRecording(recordingId: string): Promise<ProcessingStatus> {
  return request<ProcessingStatus>({
    method: 'POST',
    url: `/process-recording/workflow/${recordingId}/process`,
  });
}

/** Generate a polished markdown guide (non-streaming) */
export async function generateGuide(recordingId: string): Promise<GuideResponse> {
  return request<GuideResponse>({
    method: 'POST',
    url: `/process-recording/workflow/${recordingId}/generate-guide`,
  });
}

/** Get previously generated guide */
export async function getGuide(recordingId: string): Promise<GuideResponse> {
  return request<GuideResponse>({
    method: 'GET',
    url: `/process-recording/workflow/${recordingId}/guide`,
  });
}

/** Get AI summary and step annotations */
export async function getAISummary(recordingId: string): Promise<AISummary> {
  return request<AISummary>({
    method: 'GET',
    url: `/process-recording/workflow/${recordingId}/ai-summary`,
  });
}

/** Re-annotate a single step */
export async function annotateStep(stepId: string): Promise<StepAnnotation> {
  return request<StepAnnotation>({
    method: 'POST',
    url: `/process-recording/steps/${stepId}/annotate`,
  });
}

/** Improve a step's description */
export async function improveStep(stepId: string): Promise<StepAnnotation> {
  return request<StepAnnotation>({
    method: 'POST',
    url: `/process-recording/steps/${stepId}/improve`,
  });
}

/** Stream guide generation via SSE */
export async function streamGuide(
  recordingId: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: Error) => void,
  signal?: AbortSignal,
): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/process-recording/workflow/${recordingId}/generate-guide/stream`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
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

/** Smart search across recordings and steps */
export async function smartSearch(
  query: string,
  projectId: string,
  limit = 20,
): Promise<SearchResponse> {
  return request<SearchResponse>({
    method: 'GET',
    url: '/search/search',
    params: { q: query, project_id: projectId, limit },
  });
}
