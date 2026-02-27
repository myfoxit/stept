import React from 'react';
import { theme } from './theme';
import { OndokiLogo } from './OndokiLogo';
import type { SpotMode } from './types';

interface FooterProps {
  mode: SpotMode;
}

export const Footer: React.FC<FooterProps> = ({ mode }) => (
  <div className="footer">
    <div style={{ display: 'flex', gap: 8 }}>
      {mode === 'search' ? (
        <>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              color: theme.textMuted,
            }}
          >
            <span className="kbd">↑↓</span> Nav
          </span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              color: theme.textMuted,
            }}
          >
            <span className="kbd">↵</span> Open
          </span>
        </>
      ) : (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 10,
            color: theme.textMuted,
          }}
        >
          <span className="kbd">↵</span> Send
        </span>
      )}
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          fontSize: 10,
          color: theme.textMuted,
        }}
      >
        <span className="kbd">Tab</span> {mode === 'search' ? 'AI' : 'Search'}
      </span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <OndokiLogo width={12} height={11} />
      <span style={{ fontSize: 10, color: theme.textMuted, fontWeight: 500 }}>
        ondoki
      </span>
    </div>
  </div>
);
