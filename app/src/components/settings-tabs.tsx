import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useProject } from '@/providers/project-provider';

const tabs: { label: string; path: string; external?: boolean }[] = [
  { label: 'General', path: 'settings' },
  { label: 'AI', path: 'settings/ai' },
  { label: 'Privacy', path: 'settings/privacy' },
  { label: 'Integrations', path: 'settings/integrations' },
  { label: 'SSO', path: 'settings/sso' },
  { label: 'Analytics', path: '/analytics' },
  { label: 'Knowledge Base', path: '/knowledge' },
  { label: 'Audit Log', path: '/audit' },
  { label: 'Documentation', path: 'https://docs.ondoki.app', external: true },
];

export function SettingsTabs() {
  const location = useLocation();
  const { selectedProjectId } = useProject();

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab) => {
        const href = tab.path.startsWith('/')
          ? tab.path
          : `/projects/${selectedProjectId}/${tab.path}`;

        // Match logic: for project-relative paths, check if pathname ends with the path
        let isActive: boolean;
        if (tab.path === 'settings') {
          // General tab: active only on exact settings path (not sub-tabs)
          isActive = location.pathname === `/projects/${selectedProjectId}/settings`;
        } else if (tab.path.startsWith('settings/')) {
          isActive = location.pathname === href;
        } else {
          isActive = location.pathname === tab.path;
        }

        if (tab.external) {
          return (
            <a
              key={tab.label}
              href={tab.path}
              target="_blank"
              rel="noopener noreferrer"
              className="whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors border-transparent text-muted-foreground hover:text-foreground hover:border-border inline-flex items-center gap-1"
            >
              {tab.label}
              <ExternalLink size={14} />
            </a>
          );
        }

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
