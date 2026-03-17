/**
 * Embed workflow viewer — minimal, chromeless version for iframes.
 * No app navigation, compact layout, light background only.
 */
import React, { useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiClient';
import { WorkflowViewer, type ViewMode, type PublicWorkflow } from '@/components/workflow/WorkflowViewer';
import { ContentLanguageToggle } from '@/components/ui/content-language-toggle';

async function fetchPublicWorkflow(token: string, lang?: string): Promise<PublicWorkflow> {
  const baseUrl = getApiBaseUrl();
  const langParam = lang ? `?lang=${lang}` : '';
  const res = await fetch(`${baseUrl.replace('/api/v1', '')}/api/v1/public/workflow/${token}${langParam}`);
  if (res.status === 403) throw new Error('access_denied');
  if (!res.ok) throw new Error('not_found');
  return res.json();
}

export function EmbedWorkflowPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);

  const modeParam = searchParams.get('mode');
  const langParam = searchParams.get('lang') || '';
  const mode: ViewMode =
    (modeParam === 'movie' || modeParam === 'slides' || modeParam === 'expanded')
      ? modeParam
      : 'slides';

  const [contentLang, setContentLang] = React.useState(langParam || 'original');

  const { data: workflow, isLoading, isFetching, error } = useQuery({
    queryKey: ['public-workflow', token, contentLang],
    queryFn: () => fetchPublicWorkflow(token!, contentLang !== 'original' ? contentLang : undefined),
    enabled: !!token,
  });

  // Communicate height to parent for auto-resize
  useEffect(() => {
    const sendHeight = () => {
      const height = document.body.scrollHeight;
      window.parent.postMessage({ type: 'stept-embed-resize', height }, '*');
    };

    sendHeight();
    const observer = new ResizeObserver(sendHeight);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [workflow, mode]);

  if (isLoading) {
    return (
      <div style={styles.centerContainer}>
        <div style={{ color: '#888', fontSize: 14 }}>Loading workflow…</div>
      </div>
    );
  }

  if (error || !workflow) {
    const isAccessDenied = error instanceof Error && error.message === 'access_denied';
    return (
      <div style={styles.centerContainer}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          {isAccessDenied ? (
            <>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Access Required</div>
              <div style={{ color: '#888', fontSize: 13 }}>This workflow is private.</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Workflow not found</div>
              <div style={{ color: '#888', fontSize: 13 }}>This link may have expired or been removed.</div>
            </>
          )}
        </div>
      </div>
    );
  }

  const publicUrl = `${window.location.origin}/public/workflow/${token}`;

  return (
    <div ref={containerRef} style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h1 style={styles.title}>{workflow.name || 'Untitled Workflow'}</h1>
          <ContentLanguageToggle
            value={contentLang}
            onChange={setContentLang}
            loading={isFetching && contentLang !== 'original'}
            compact
          />
        </div>
        <div style={styles.meta}>
          <span>{workflow.total_steps} steps</span>
          {workflow.estimated_time && <span> · {workflow.estimated_time}</span>}
        </div>
      </div>

      {/* Viewer */}
      <WorkflowViewer
        workflow={workflow}
        token={token!}
        mode={mode}
        compact
      />

      {/* Footer */}
      <div style={styles.footer}>
        <span style={{ color: '#999', fontSize: 12 }}>Powered by </span>
        <a href="https://stept.ai" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>
          Stept
        </a>
        <span style={{ color: '#ccc', margin: '0 8px' }}>·</span>
        <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={styles.footerLink}>
          Open full view ↗
        </a>
      </div>
    </div>
  );
}

const ACCENT = '#4f46e5';

const styles: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    background: '#ffffff',
    color: '#1a1a1a',
    minHeight: '100vh',
    padding: '16px 20px 24px',
    maxWidth: 760,
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  centerContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    background: '#ffffff',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    margin: '0 0 4px 0',
    color: '#1a1a1a',
  },
  meta: {
    fontSize: 13,
    color: '#888',
  },
  footer: {
    marginTop: 24,
    paddingTop: 12,
    borderTop: '1px solid #f0f0f0',
    textAlign: 'center' as const,
    fontSize: 12,
  },
  footerLink: {
    color: ACCENT,
    textDecoration: 'none',
    fontWeight: 500,
    fontSize: 12,
  },
};
