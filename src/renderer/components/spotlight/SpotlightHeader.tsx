import React from 'react';
import { ChevronDown, Settings } from 'lucide-react';
import { theme } from './theme';
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <OndokiLogo />
    </div>

    {/* Project selector */}
    <div style={{ flex: 1, position: 'relative' }}>
      <select
        value={selectedProjectId}
        onChange={(e) => {
          onProjectChange(e.target.value);
          window.electronAPI?.contextStart?.(e.target.value);
        }}
        style={{
          width: '100%',
          padding: '6px 28px 6px 10px',
          borderRadius: theme.radius.sm,
          border: '1px solid rgba(0,0,0,0.1)',
          background: theme.bg,
          fontFamily: theme.font.sans,
          fontSize: 12,
          fontWeight: 500,
          color: theme.dark,
          appearance: 'none',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {auth.projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        {auth.projects.length === 0 && <option value="">No projects</option>}
      </select>
      <ChevronDown
        size={12}
        color={theme.textMuted}
        strokeWidth={2.5}
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
        }}
      />
    </div>

    {/* Settings gear */}
    <button
      onClick={() => window.electronAPI?.openSettingsWindow?.()}
      style={{
        width: 30,
        height: 30,
        borderRadius: theme.radius.sm,
        border: '1px solid rgba(0,0,0,0.08)',
        background: theme.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'all 0.15s',
      }}
    >
      <Settings size={14} color={theme.textSecondary} strokeWidth={2} />
    </button>
  </div>
);
