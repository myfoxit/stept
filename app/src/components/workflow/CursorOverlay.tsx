import React from 'react';

interface CursorOverlayProps {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  visible: boolean;
  clicking?: boolean;
}

export function CursorOverlay({ x, y, visible, clicking }: CursorOverlayProps) {
  return (
    <div
      className="absolute pointer-events-none z-20"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        opacity: visible ? 1 : 0,
        transform: `translate(-2px, -2px) ${clicking ? 'scale(0.85)' : 'scale(1)'}`,
        transition: 'left 1200ms cubic-bezier(0.25, 0.1, 0.25, 1), top 1200ms cubic-bezier(0.25, 0.1, 0.25, 1), opacity 300ms ease, transform 200ms ease',
        willChange: 'left, top, transform',
      }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ filter: 'drop-shadow(1px 2px 3px rgba(0,0,0,0.3))' }}>
        <path d="M5 3l14 9-6.5 1.5L10 20z" fill="white" stroke="black" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
