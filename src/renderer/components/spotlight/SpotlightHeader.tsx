import React from 'react';
import { ChevronDown, Settings } from 'lucide-react';
import { OndokiLogo } from './OndokiLogo';
import type { AuthState } from './types';

interface SpotlightHeaderProps {
  auth: AuthState;
  selectedProjectId: string;
  onProjectChange: (id: string) => void;
}

export const SpotlightHeader: React.FC<SpotlightHeaderProps> = ({
  auth,
  selectedProjectId,
  onProjectChange,
}) => (
  <div className="spotlight-header">
    {/* Logo */}
    <div className="header-logo">
      <OndokiLogo />
    </div>

    {/* Project selector */}
    <div className="header-project">
      <select
        value={selectedProjectId}
        onChange={(e) => {
          onProjectChange(e.target.value);
          window.electronAPI?.contextStart?.(e.target.value);
        }}
        className="header-select"
      >
        {auth.projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        {auth.projects.length === 0 && <option value="">No projects</option>}
      </select>
      <ChevronDown size={12} strokeWidth={2.5} className="header-chevron" />
    </div>

    {/* Settings gear */}
    <button
      onClick={() => window.electronAPI?.openSettingsWindow?.()}
      className="header-settings-btn"
    >
      <Settings size={14} strokeWidth={2} />
    </button>
  </div>
);
