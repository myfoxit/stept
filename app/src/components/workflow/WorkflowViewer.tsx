import React, { useMemo } from 'react';
import { getApiBaseUrl } from '@/lib/apiClient';
import { ModeSelector, type ViewMode } from './ModeSelector';
import { SlidesPlayer } from './SlidesPlayer';
import { MoviePlayer } from './MoviePlayer';
import { SandboxViewer } from './SandboxViewer';

/* ── Types (shared) ── */

export interface PublicStep {
  step_number: number;
  step_type: string | null;
  action_type?: string | null;
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
  element_info?: Record<string, unknown> | null;
  has_dom_snapshot?: boolean;
}

export interface PublicWorkflow {
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

interface WorkflowViewerProps {
  workflow: PublicWorkflow;
  token: string;
  mode: ViewMode;
  onModeChange?: (mode: ViewMode) => void;
  compact?: boolean;
  showModeSelector?: boolean;
}

export { type ViewMode } from './ModeSelector';

/* ── Expanded mode (original layout) ── */

function ExpandedView({ workflow, token, compact }: { workflow: PublicWorkflow; token: string; compact?: boolean }) {
  const baseUrl = getApiBaseUrl();
  let visibleIndex = 0;

  return (
    <div className="space-y-6">
      {workflow.steps.map((step) => {
        const stepType = step.step_type || 'screenshot';

        if (stepType === 'header') {
          return <h2 key={step.step_number} className="text-xl font-semibold mt-8">{step.content || step.description || 'Header'}</h2>;
        }
        if (stepType === 'tip') {
          return (
            <div key={step.step_number} className="bg-green-50 dark:bg-green-950 border-l-4 border-green-500 p-4 rounded-r-lg">
              <strong>Tip:</strong> {step.content || step.description}
            </div>
          );
        }
        if (stepType === 'alert') {
          return (
            <div key={step.step_number} className="bg-amber-50 dark:bg-amber-950 border-l-4 border-amber-500 p-4 rounded-r-lg">
              <strong>Alert:</strong> {step.content || step.description}
            </div>
          );
        }

        visibleIndex++;
        const hasImage = String(step.step_number) in workflow.files;

        // Compact display for navigate, type, typing, and key actions
        const actionType = (step.step_type || '').toLowerCase();
        const isCompactStep = ['navigate', 'type', 'typing', 'key'].includes(actionType);

        if (isCompactStep) {
          return (
            <div key={step.step_number} className="flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-lg border">
              <div className="w-7 h-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {visibleIndex}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{step.description || step.window_title || `Step ${visibleIndex}`}</p>
                {step.text_typed && (
                  <p className="text-xs text-muted-foreground mt-0.5">Text: <code className="bg-muted px-1 rounded">{step.text_typed}</code></p>
                )}
                {step.key_pressed && (
                  <p className="text-xs text-muted-foreground mt-0.5">Key: <code className="bg-muted px-1 rounded">{step.key_pressed}</code></p>
                )}
              </div>
            </div>
          );
        }

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
  );
}

/* ── Main WorkflowViewer ── */

export function WorkflowViewer({
  workflow,
  token,
  mode,
  onModeChange,
  compact,
  showModeSelector = false,
}: WorkflowViewerProps) {
  const hasDomSnapshots = useMemo(
    () => workflow.steps.some(s => s.has_dom_snapshot),
    [workflow.steps],
  );

  return (
    <div>
      {showModeSelector && onModeChange && (
        <div className={compact ? 'mb-3' : 'mb-6'}>
          <ModeSelector mode={mode} onChange={onModeChange} compact={compact} hasDomSnapshots={hasDomSnapshots} />
        </div>
      )}

      {mode === 'expanded' && (
        <ExpandedView workflow={workflow} token={token} compact={compact} />
      )}

      {mode === 'slides' && (
        <SlidesPlayer
          steps={workflow.steps}
          files={workflow.files}
          token={token}
          compact={compact}
        />
      )}

      {mode === 'movie' && (
        <MoviePlayer
          steps={workflow.steps}
          files={workflow.files}
          token={token}
          compact={compact}
        />
      )}

      {mode === 'sandbox' && (
        <SandboxViewer
          steps={workflow.steps}
          files={workflow.files}
          token={token}
          compact={compact}
        />
      )}
    </div>
  );
}
