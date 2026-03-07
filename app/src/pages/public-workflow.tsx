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
  screenshot_relative_position: { x: number; y: number } | null;
  screenshot_size: { width: number; height: number } | null;
  window_size: { width: number; height: number } | null;
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
  if (res.status === 403) {
    throw new Error('access_denied');
  }
  if (!res.ok) throw new Error('not_found');
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
    const isAccessDenied = error instanceof Error && error.message === 'access_denied';
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4">
          {isAccessDenied ? (
            <>
              <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🔒</span>
              </div>
              <h1 className="text-2xl font-bold mb-2">Access Required</h1>
              <p className="text-muted-foreground mb-6">
                This workflow is private. Ask the owner to share it with you.
              </p>
              <a
                href="/"
                className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
              >
                Go to Ondoki
              </a>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-2">Workflow not found</h1>
              <p className="text-muted-foreground">This link may have expired or been removed.</p>
            </>
          )}
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
              <span key={tag} className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs dark:bg-primary/20 dark:text-primary">
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
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                    {visibleIndex}
                  </div>
                  <h3 className="font-medium">{step.description || step.window_title || `Step ${visibleIndex}`}</h3>
                </div>
                {hasImage && (() => {
                  const screenshotRel = step.screenshot_relative_position;
                  const screenshotSize = step.screenshot_size ?? step.window_size;
                  let circlePos: { x: number; y: number } | null = null;
                  if (screenshotRel && screenshotSize) {
                    circlePos = {
                      x: (screenshotRel.x / screenshotSize.width) * 100,
                      y: (screenshotRel.y / screenshotSize.height) * 100,
                    };
                  }
                  return (
                    <div className="p-4">
                      <div className="relative">
                        <img
                          src={`${baseUrl.replace('/api/v1', '')}/api/v1/public/workflow/${token}/image/${step.step_number}`}
                          alt={`Step ${visibleIndex}`}
                          className="w-full rounded-lg border"
                        />
                        {circlePos && (
                          <div
                            className="absolute pointer-events-none"
                            style={{
                              left: `${circlePos.x}%`,
                              top: `${circlePos.y}%`,
                              transform: 'translate(-50%, -50%)',
                            }}
                          >
                            <div className="absolute -inset-4 rounded-full bg-primary/20 animate-pulse" />
                            <div className="relative h-8 w-8 rounded-full border-2 border-primary bg-primary/30">
                              <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
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
            <a href="/" className="text-primary hover:underline font-medium">
              Ondoki
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
