import React, { useEffect, useState } from 'react';
import { sendToBackground } from '@/shared/messages';

interface Workflow {
  id: string;
  name?: string;
  created_at?: string;
  total_steps?: number;
  has_guide?: boolean;
}

interface RecentWorkflowsProps {
  selectedProjectId: string;
  onPlayGuide: (workflowId: string) => void;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function RecentWorkflows({
  selectedProjectId,
  onPlayGuide,
}: RecentWorkflowsProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [webAppUrl, setWebAppUrl] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!selectedProjectId) {
        setWorkflows([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(false);

      try {
        const settings = await sendToBackground<any>({ type: 'GET_SETTINGS' });
        const apiBaseUrl = settings.apiBaseUrl || 'http://localhost:8000/api/v1';
        const frontendUrl =
          settings.frontendUrl || apiBaseUrl.replace('/api/v1', '');
        setWebAppUrl(frontendUrl);

        const result = await sendToBackground<any>({
          type: 'API_FETCH',
          url: `${apiBaseUrl}/process-recording/workflows/filtered?project_id=${selectedProjectId}&limit=10&sort_by=created_at&sort_order=desc`,
        });

        if (cancelled) return;

        if (!result || !Array.isArray(result)) {
          setWorkflows([]);
        } else {
          setWorkflows(result);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  const handleItemClick = (e: React.MouseEvent, url: string) => {
    if ((e.target as HTMLElement).closest('.workflow-play-btn')) return;
    e.preventDefault();
    chrome.tabs.create({ url });
  };

  return (
    <div className="recent-workflows" id="recentWorkflows">
      <div className="recent-header">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#78716C"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>Recent Workflows</span>
      </div>

      <div className="recent-list" id="recentList">
        {loading && (
          <div className="recent-loading" id="recentLoading">
            Loading...
          </div>
        )}

        {!loading && error && (
          <div className="recent-empty">Failed to load workflows</div>
        )}

        {!loading && !error && !selectedProjectId && (
          <div className="recent-empty">Select a project to see workflows</div>
        )}

        {!loading && !error && selectedProjectId && workflows.length === 0 && (
          <div className="recent-empty">No workflows yet</div>
        )}

        {!loading &&
          !error &&
          workflows.map((w) => {
            const title = w.name || 'Untitled workflow';
            const date = w.created_at ? timeAgo(new Date(w.created_at)) : '';
            const stepCount = w.total_steps || 0;
            const url = `${webAppUrl}/workflow/${w.id}`;

            return (
              <a
                key={w.id}
                className="recent-item"
                href="#"
                data-url={url}
                onClick={(e) => handleItemClick(e, url)}
              >
                <div className="recent-item-icon">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#78716C"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                </div>
                <div className="recent-item-info">
                  <div className="recent-item-title">{title}</div>
                  <div className="recent-item-meta">
                    {stepCount} steps &middot; {date}
                  </div>
                </div>
                {w.has_guide && (
                  <button
                    className="workflow-play-btn"
                    data-workflow-id={w.id}
                    title="Play interactive guide"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onPlayGuide(w.id);
                    }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      stroke="none"
                    >
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </button>
                )}
              </a>
            );
          })}
      </div>
    </div>
  );
}
