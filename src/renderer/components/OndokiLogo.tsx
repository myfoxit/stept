import React from 'react';

interface OndokiLogoProps {
  size?: number;
}

export const OndokiLogo: React.FC<OndokiLogoProps> = ({ size = 48 }) => {
  const scale = size / 48;
  const w = 72 * scale;
  const h = 64 * scale;
  return (
    <svg width={size} height={size * 44 / 48} viewBox="0 0 72 64" fill="none">
      <rect x="6" y="8" width="26" height="10" rx="5" fill="#6C5CE7" />
      <rect x="6" y="26" width="46" height="10" rx="5" fill="#6C5CE7" />
      <rect x="6" y="44" width="36" height="10" rx="5" fill="#6C5CE7" />
      <path d="M58 6 L60.5 14 L68 16.5 L60.5 19 L58 27 L55.5 19 L48 16.5 L55.5 14 Z" fill="#00D2D3" />
    </svg>
  );
};

export const OndokiLogoSmall: React.FC = () => (
  <svg width="16" height="14" viewBox="0 0 72 64" fill="none">
    <rect x="6" y="8" width="26" height="10" rx="5" fill="#6C5CE7" />
    <rect x="6" y="26" width="46" height="10" rx="5" fill="#6C5CE7" />
    <rect x="6" y="44" width="36" height="10" rx="5" fill="#6C5CE7" />
    <path d="M58 6 L60.5 14 L68 16.5 L60.5 19 L58 27 L55.5 19 L48 16.5 L55.5 14 Z" fill="#00D2D3" />
  </svg>
);
