import type { SpotlightResult } from './types';

export const QUESTION_PATTERN =
  /^(how|what|why|when|where|who|which|can|does|is|are|do|should|could|would|tell|explain|describe|show)\b/i;

export function groupResults(
  results: SpotlightResult[],
): Record<string, SpotlightResult[]> {
  const groups: Record<string, SpotlightResult[]> = {};
  for (const r of results) {
    const type = r.type || r.resource_type || 'other';
    const label =
      type === 'workflow'
        ? 'Workflows'
        : type === 'document' || type === 'page'
          ? 'Pages'
          : 'Results';
    if (!groups[label]) groups[label] = [];
    groups[label].push(r);
  }
  return groups;
}

export function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
