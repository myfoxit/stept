export const theme = {
  accent: '#3CB489',
  accentHover: '#35A07A',
  accentGradient: 'linear-gradient(135deg, #2EBD8E 0%, #22A077 100%)',
  accentGlow: '0 4px 16px rgba(62,175,138,0.3)',
  dark: '#222222',
  darkHover: '#333333',
  text: '#222222',
  textSecondary: '#999999',
  textMuted: '#AAAAAA',
  bg: '#FAFBFC',
  bgAlt: '#F7F8F9',
  card: '#ffffff',
  border: '#E8E8EC',
  borderLight: '#F0F0F4',
  borderMedium: '#E0E0E4',
  inputBg: '#F8F8FA',
  sectionHeader: '#6EC4A4',
  radius: { sm: 8, md: 12, lg: 14, xl: 20, pill: 999 },
  font: {
    sans: "'DM Sans', sans-serif",
    mono: "'JetBrains Mono', monospace",
  },
} as const;

export type Theme = typeof theme;
