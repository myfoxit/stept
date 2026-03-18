export const theme = {
  accent: '#3CB489',
  accentHover: '#35A07A',
  accentGradient: 'linear-gradient(135deg, #2EBD8E 0%, #22A077 100%)',
  accentGlow: '0 4px 16px rgba(62,175,138,0.3)',
  dark: '#222222',
  darkHover: '#333333',
  text: '#222222',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  bg: '#f9fafb',
  bgAlt: '#f3f4f6',
  card: '#ffffff',
  border: '#e5e7eb',
  borderLight: '#f3f4f6',
  borderMedium: '#e5e7eb',
  inputBg: '#f9fafb',
  sectionHeader: '#6b7280',
  radius: { sm: 8, md: 12, lg: 14, xl: 20, pill: 999 },
  font: {
    sans: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono: "ui-monospace, monospace",
  },
} as const;

export type Theme = typeof theme;
