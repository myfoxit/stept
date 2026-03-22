/**
 * Public workflow viewer — read-only, no auth required.
 * Renders a beautiful guide view of a shared workflow.
 */
import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiClient';
import { WorkflowViewer, type ViewMode, type PublicWorkflow } from '@/components/workflow/WorkflowViewer';
import { SandboxViewer } from '@/components/workflow/SandboxViewer';
import { ContentLanguageToggle } from '@/components/ui/content-language-toggle';

async function fetchPublicWorkflow(token: string, lang?: string): Promise<PublicWorkflow> {
  const baseUrl = getApiBaseUrl();
  const langParam = lang && lang !== 'original' ? `?lang=${lang}` : '';
  const res = await fetch(`${baseUrl.replace('/api/v1', '')}/api/v1/public/workflow/${token}${langParam}`);
  if (res.status === 403) {
    throw new Error('access_denied');
  }
  if (!res.ok) throw new Error('not_found');
  return res.json();
}

export function PublicWorkflowPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const modeParam = searchParams.get('mode');
  const langParam = searchParams.get('lang') || 'original';
  const mode: ViewMode = (modeParam === 'movie' || modeParam === 'slides' || modeParam === 'expanded' || modeParam === 'sandbox')
    ? modeParam
    : 'expanded';

  const setLang = (lang: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (lang === 'original') {
        next.delete('lang');
      } else {
        next.set('lang', lang);
      }
      return next;
    }, { replace: true });
  };

  const { data: workflow, isLoading, isFetching, error } = useQuery({
    queryKey: ['public-workflow', token, langParam],
    queryFn: () => fetchPublicWorkflow(token!, langParam !== 'original' ? langParam : undefined),
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
                Go to Stept
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

  // ── Sandbox mode: dedicated full-screen layout, no chrome ──
  if (mode === 'sandbox') {
    return (
      <div className="min-h-screen bg-background">
        <SandboxViewer
          steps={workflow.steps}
          files={workflow.files}
          token={token!}
        />
        <div className="fixed bottom-2 right-3 z-50">
          <a href="/" className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
            Made with Stept
          </a>
        </div>
      </div>
    );
  }

  // ── Classic modes: Slides / Movie / Expanded ──
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-2">
          <h1 className="text-3xl font-bold">{workflow.name || 'Untitled Workflow'}</h1>
          <ContentLanguageToggle
            value={langParam}
            onChange={setLang}
            loading={isFetching && langParam !== 'original'}
          />
        </div>
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

        {/* Viewer — no mode selector for public viewers, author chose the mode */}
        <WorkflowViewer
          workflow={workflow}
          token={token!}
          mode={mode}
          compact={false}
        />

        {/* Footer */}
        <div className="mt-16 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>
            Made with{' '}
            <a href="/" className="text-primary hover:underline font-medium">
              Stept
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
