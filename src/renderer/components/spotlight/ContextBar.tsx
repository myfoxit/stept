import React from 'react';
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
    <span className="context-dot" />
    <span className="context-app">{contextInfo.appName}</span>
    {contextInfo.url && (
      <span className="context-url">
        &middot;{' '}
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
      <span className="context-badge">{contextMatchCount} linked</span>
    )}
  </div>
);
