import React from 'react';
import { SteptLogo } from './SteptLogo';
import type { SpotMode } from './types';

interface FooterProps {
  mode: SpotMode;
}

export const Footer: React.FC<FooterProps> = ({ mode }) => (
  <div className="footer">
    <div className="footer-hints">
      {mode === 'search' ? (
        <>
          <span className="footer-hint">
            <span className="kbd">&uarr;&darr;</span> Nav
          </span>
          <span className="footer-hint">
            <span className="kbd">&crarr;</span> Open
          </span>
        </>
      ) : (
        <span className="footer-hint">
          <span className="kbd">&crarr;</span> Send
        </span>
      )}
      <span className="footer-hint">
        <span className="kbd">Tab</span> {mode === 'search' ? 'AI' : 'Search'}
      </span>
    </div>
    <div className="footer-brand">
      <SteptLogo width={12} height={11} />
      <span className="footer-brand-text">stept</span>
    </div>
  </div>
);
