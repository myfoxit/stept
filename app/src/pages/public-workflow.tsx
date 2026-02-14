/**
 * Public workflow viewer — read-only, no auth required.
 * Renders a beautiful guide view of a shared workflow.
 */
import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiClient';

interface PublicStep {
  step_number: number;
  step_type: string | null;
  description: string | null;
  content: string | null;
  window_title: string | null;
  text_typed: string | null;
  key_pressed: string | null;
  generated_title: string | null;
  generated_description: string | null;
}

interface PublicWorkflow {
  id: string;
  name: string;
  created_at: string;
  summary: string | null;
  tags: string[] | null;
  estimated_time: string | null;
  difficulty: string | null;
  guide_markdown: string | null;
  steps: PublicStep[];
  files: Record<string, string>;
  total_steps: number;
}

async function fetchPublicWorkflow(token: string): Promise<PublicWorkflow> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl.replace('/api/v1', '')}/api/v1/public/workflow/${token}`);
  if (!res.ok) throw new Error('Workflow not found');
  return res.json();
}

export function PublicWorkflowPage() {
  const { token } = useParams<{ token: string }>();
  const { data: workflow, isLoading, error } = useQuery({
    queryKey: ['public-workflow', token],
    queryFn: () => fetchPublicWorkflow(token!),
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading workflow…</div>
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Workflow not found</h1>
          <p className="text-muted-foreground">This link may have expired or been removed.</p>
        </div>
      </div>
    );
  }

  const baseUrl = getApiBaseUrl();
  let visibleIndex = 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Header */}
        <h1 className="text-3xl font-bold mb-2">{workflow.name || 'Untitled Workflow'}</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-6">
          <span>{workflow.total_steps} steps</span>
          {workflow.estimated_time && <span>• {workflow.estimated_time}</span>}
          {workflow.difficulty && <span>• {workflow.difficulty}</span>}
        </div>
        {workflow.tags && workflow.tags.length > 0 && (
          <div className="flex gap-2 mb-6 flex-wrap">
            {workflow.tags.map((tag) => (
              <span key={tag} className="px-2 py-1 rounded-full bg-violet-100 text-violet-700 text-xs dark:bg-violet-900 dark:text-violet-300">
                {tag}
              </span>
            ))}
          </div>
        )}
        {workflow.summary && (
          <p className="text-muted-foreground mb-8">{workflow.summary}</p>
        )}

        {/* Steps */}
        <div className="space-y-6">
          {workflow.steps.map((step) => {
            const stepType = step.step_type || 'screenshot';
            
            if (stepType === 'header') {
              return <h2 key={step.step_number} className="text-xl font-semibold mt-8">{step.content || step.description || 'Header'}</h2>;
            }
            if (stepType === 'tip') {
              return (
                <div key={step.step_number} className="bg-green-50 dark:bg-green-950 border-l-4 border-green-500 p-4 rounded-r-lg">
                  💡 <strong>Tip:</strong> {step.content || step.description}
                </div>
              );
            }
            if (stepType === 'alert') {
              return (
                <div key={step.step_number} className="bg-amber-50 dark:bg-amber-950 border-l-4 border-amber-500 p-4 rounded-r-lg">
                  ⚠️ <strong>Alert:</strong> {step.content || step.description}
                </div>
              );
            }

            visibleIndex++;
            const hasImage = String(step.step_number) in workflow.files;

            return (
              <div key={step.step_number} className="bg-card rounded-xl border shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b">
                  <div className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center text-sm font-semibold">
                    {visibleIndex}
                  </div>
                  <h3 className="font-medium">{step.description || step.window_title || `Step ${visibleIndex}`}</h3>
                </div>
                {hasImage && (
                  <div className="p-4">
                    <img
                      src={`${baseUrl.replace('/api/v1', '')}/api/v1/public/workflow/${token}/image/${step.step_number}`}
                      alt={`Step ${visibleIndex}`}
                      className="w-full rounded-lg border"
                    />
                  </div>
                )}
                {(step.text_typed || step.key_pressed) && (
                  <div className="px-4 pb-4 space-y-1 text-sm text-muted-foreground">
                    {step.text_typed && <div>Text entered: <code className="bg-muted px-1 rounded">{step.text_typed}</code></div>}
                    {step.key_pressed && <div>Key pressed: <code className="bg-muted px-1 rounded">{step.key_pressed}</code></div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>
            Made with{' '}
            <a href="/" className="text-violet-600 hover:underline font-medium">
              Ondoki
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
