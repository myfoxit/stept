import React from 'react';
import { theme } from './theme';
import type { ContextInfo } from './types';

interface ContextBarProps {
  contextInfo: ContextInfo;
  contextMatchCount: number;
}

export const ContextBar: React.FC<ContextBarProps> = ({
  contextInfo,
  contextMatchCount,
}) => (
  <div className="context-bar">
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: theme.accent,
        flexShrink: 0,
      }}
    />
    <span style={{ color: theme.dark, fontWeight: 600 }}>
      {contextInfo.appName}
    </span>
    {contextInfo.url && (
      <span
        style={{
          color: theme.textMuted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        ·{' '}
        {(() => {
          try {
            return new URL(contextInfo.url).hostname;
          } catch {
            return contextInfo.url;
          }
        })()}
      </span>
    )}
    {contextMatchCount > 0 && (
      <span
        style={{
          marginLeft: 'auto',
          padding: '1px 8px',
          borderRadius: 10,
          background: 'rgba(26,26,26,0.06)',
          color: theme.dark,
          fontWeight: 600,
          fontSize: 10,
        }}
      >
        {contextMatchCount} linked
      </span>
    )}
  </div>
);
