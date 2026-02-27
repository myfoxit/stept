export const theme = {
  accent: '#3ab08a',
  accentHover: '#2f9a78',
  dark: '#1A1A1A',
  darkHover: '#333333',
  text: '#1A1A1A',
  textSecondary: '#6E6E6E',
  textMuted: '#999999',
  bg: '#F5F5F5',
  card: '#ffffff',
  border: 'rgba(0,0,0,0.07)',
  borderLight: 'rgba(0,0,0,0.04)',
  borderMedium: '#E0E0E0',
  radius: { sm: 8, md: 10, lg: 14, xl: 20 },
  font: {
    sans: "'DM Sans', sans-serif",
    display: "'Outfit', sans-serif",
    mono: "'JetBrains Mono', monospace",
  },
} as const;

export type Theme = typeof theme;
