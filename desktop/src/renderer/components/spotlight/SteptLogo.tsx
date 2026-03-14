import React from 'react';

export const SteptLogo: React.FC<{ width?: number; height?: number }> = ({
  width = 20,
  height = 19,
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 38 36"
    fill="none"
    className="stept-logo"
  >
    <rect x="0" y="4" width="32" height="32" rx="9" fill="currentColor" />
    <rect x="7" y="11" width="10" height="3.5" rx="1.75" fill="white" />
    <rect x="7" y="17.5" width="18" height="3.5" rx="1.75" fill="white" />
    <rect x="7" y="24" width="14" height="3.5" rx="1.75" fill="white" />
    <path
      d="M33 0 L34.5 4.5 L38 6 L34.5 7.5 L33 12 L31.5 7.5 L28 6 L31.5 4.5 Z"
      fill="currentColor"
    />
  </svg>
);
