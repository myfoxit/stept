import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useProject } from '@/providers/project-provider';

const tabs = [
  { label: 'General', path: 'settings' },
  { label: 'Context Links', path: '/context-links' },
  { label: 'Analytics', path: '/analytics' },
  { label: 'Knowledge Base', path: '/knowledge' },
  { label: 'Knowledge Graph', path: '/knowledge-graph' },
  { label: 'Video → Guide', path: '/video-import' },
  { label: 'Audit Log', path: '/audit' },
];

export function SettingsTabs() {
  const location = useLocation();
  const { selectedProjectId } = useProject();

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab) => {
        const href =
          tab.path === 'settings'
            ? `/projects/${selectedProjectId}/settings`
            : tab.path;
        const isActive =
          tab.path === 'settings'
            ? location.pathname.includes('/settings')
            : location.pathname === tab.path;

        return (
          <Link
            key={tab.label}
            to={href}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
