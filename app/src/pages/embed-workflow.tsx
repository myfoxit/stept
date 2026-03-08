/**
 * Embed workflow viewer — minimal, chromeless version for iframes.
 * No app navigation, compact layout, light background only.
 */
import React, { useEffect, useRef } from 'react';
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
  if (res.status === 403) throw new Error('access_denied');
  if (!res.ok) throw new Error('not_found');
  return res.json();
}

export function EmbedWorkflowPage() {
  const { token } = useParams<{ token: string }>();
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: workflow, isLoading, error } = useQuery({
    queryKey: ['public-workflow', token],
    queryFn: () => fetchPublicWorkflow(token!),
    enabled: !!token,
  });

  // Communicate height to parent for auto-resize
  useEffect(() => {
    const sendHeight = () => {
      const height = document.body.scrollHeight;
      window.parent.postMessage({ type: 'ondoki-embed-resize', height }, '*');
    };

    sendHeight();
    const observer = new ResizeObserver(sendHeight);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [workflow]);

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

  const baseUrl = getApiBaseUrl();
  const publicUrl = `${window.location.origin}/public/workflow/${token}`;
  let visibleIndex = 0;

  return (
    <div ref={containerRef} style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>{workflow.name || 'Untitled Workflow'}</h1>
        <div style={styles.meta}>
          <span>{workflow.total_steps} steps</span>
          {workflow.estimated_time && <span> · {workflow.estimated_time}</span>}
        </div>
      </div>

      {/* Steps */}
      <div style={styles.stepsContainer}>
        {workflow.steps.map((step) => {
          const stepType = step.step_type || 'screenshot';

          if (stepType === 'header') {
            return (
              <h2 key={step.step_number} style={styles.sectionHeader}>
                {step.content || step.description || 'Header'}
              </h2>
            );
          }
          if (stepType === 'tip') {
            return (
              <div key={step.step_number} style={styles.tipCard}>
                💡 <strong>Tip:</strong> {step.content || step.description}
              </div>
            );
          }
          if (stepType === 'alert') {
            return (
              <div key={step.step_number} style={styles.alertCard}>
                ⚠️ <strong>Alert:</strong> {step.content || step.description}
              </div>
            );
          }

          visibleIndex++;
          const hasImage = String(step.step_number) in workflow.files;

          return (
            <div key={step.step_number} style={styles.stepCard}>
              <div style={styles.stepHeader}>
                <div style={styles.stepNumber}>{visibleIndex}</div>
                <div style={styles.stepTitle}>
                  {step.description || step.window_title || `Step ${visibleIndex}`}
                </div>
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
                  <div style={styles.imageContainer}>
                    <div style={{ position: 'relative' }}>
                      <img
                        src={`${baseUrl.replace('/api/v1', '')}/api/v1/public/workflow/${token}/image/${step.step_number}`}
                        alt={`Step ${visibleIndex}`}
                        style={styles.screenshot}
                      />
                      {circlePos && (
                        <div
                          style={{
                            position: 'absolute',
                            left: `${circlePos.x}%`,
                            top: `${circlePos.y}%`,
                            transform: 'translate(-50%, -50%)',
                            pointerEvents: 'none',
                          }}
                        >
                          <div style={styles.clickPulse} />
                          <div style={styles.clickCircle}>
                            <div style={styles.clickDot} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              {(step.text_typed || step.key_pressed) && (
                <div style={styles.actionInfo}>
                  {step.text_typed && (
                    <div>Text entered: <code style={styles.codeTag}>{step.text_typed}</code></div>
                  )}
                  {step.key_pressed && (
                    <div>Key pressed: <code style={styles.codeTag}>{step.key_pressed}</code></div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span style={{ color: '#999', fontSize: 12 }}>Powered by </span>
        <a href="https://ondoki.com" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>
          Ondoki
        </a>
        <span style={{ color: '#ccc', margin: '0 8px' }}>·</span>
        <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={styles.footerLink}>
          Open full view ↗
        </a>
      </div>

      {/* Inline styles for pulse animation */}
      <style>{`
        @keyframes ondoki-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 0.2; transform: scale(1.5); }
        }
      `}</style>
    </div>
  );
}

const ACCENT = '#3AB08A';

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
  stepsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: 600,
    marginTop: 12,
    marginBottom: 0,
    color: '#1a1a1a',
  },
  tipCard: {
    background: '#f0fdf4',
    borderLeft: `3px solid ${ACCENT}`,
    padding: '10px 14px',
    borderRadius: '0 6px 6px 0',
    fontSize: 13,
    color: '#1a1a1a',
  },
  alertCard: {
    background: '#fffbeb',
    borderLeft: '3px solid #f59e0b',
    padding: '10px 14px',
    borderRadius: '0 6px 6px 0',
    fontSize: 13,
    color: '#1a1a1a',
  },
  stepCard: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderBottom: '1px solid #f0f0f0',
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: ACCENT,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: 500,
  },
  imageContainer: {
    padding: 10,
  },
  screenshot: {
    width: '100%',
    borderRadius: 6,
    border: '1px solid #e5e7eb',
    display: 'block',
  },
  clickPulse: {
    position: 'absolute' as const,
    inset: -6,
    borderRadius: '50%',
    background: `${ACCENT}33`,
    animation: 'ondoki-pulse 2s ease-in-out infinite',
  },
  clickCircle: {
    position: 'relative' as const,
    width: 24,
    height: 24,
    borderRadius: '50%',
    border: `2px solid ${ACCENT}`,
    background: `${ACCENT}4D`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clickDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: ACCENT,
  },
  actionInfo: {
    padding: '8px 14px 12px',
    fontSize: 12,
    color: '#666',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  codeTag: {
    background: '#f3f4f6',
    padding: '1px 5px',
    borderRadius: 3,
    fontSize: 12,
    fontFamily: 'monospace',
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
