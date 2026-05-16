import React, { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';

// ─── Full design-token type ───────────────────────────────────────────────────
export type Theme = {
  [key: string]: string | 'light-content' | 'dark-content';
  bg:          string;
  surface:     string;
  surface2:    string;
  surfaceAlt:  string;
  cellBg:      string;
  cardBg:      string;
  cardBg2:     string;
  headerBg:    string;
  inputBg:     string;
  border:      string;
  borderGlass: string;
  borderFocus: string;
  accent:      string;
  accentGlow:  string;
  textPrimary:   string;
  textSecond:    string;
  textSecondary: string;
  textMuted:     string;
  online:  string;
  offline: string;
  warn:    string;
  cyan:    string;
  gold:    string;
  red:     string;
  pink:    string;
  purple:  string;
  blue:    string;
  green:   string;
  orange:  string;
  error:        string;
  errorBg:      string;
  errorBorder:  string;
  success:      string;
  successBg:    string;
  successBorder:string;
  statusBarStyle: 'light-content' | 'dark-content';
};

// ─── Dark theme (Navy Blue) ───────────────────────────────────────────────────
export const darkTheme: Theme = {
  bg:          '#0A0F2C',
  surface:     '#111936',
  surface2:    '#0D1226',
  surfaceAlt:  '#1A2347',
  cellBg:      '#080D22',
  cardBg:      '#111936',
  cardBg2:     '#0D1226',
  headerBg:    '#111936',
  inputBg:     '#1A2347',
  border:      '#1E3A6E',
  borderGlass: 'rgba(74,144,217,0.25)',
  borderFocus: '#4A90D9',
  accent:      '#1B4FD8',
  accentGlow:  '#4A90D9',
  textPrimary:   '#E8EEF9',
  textSecond:    '#A3B8D8',
  textSecondary: '#A3B8D8',
  textMuted:     '#5B7299',
  online:  '#4ADE80',
  offline: '#F87171',
  warn:    '#FBBF24',
  cyan:    '#22D3EE',
  gold:    '#F59E0B',
  red:     '#EF4444',
  pink:    '#EC4899',
  purple:  '#1B4FD8',
  blue:    '#60A5FA',
  green:   '#4ADE80',
  orange:  '#FB923C',
  error:        '#F87171',
  errorBg:      '#2D1515',
  errorBorder:  '#7F1D1D',
  success:      '#4ADE80',
  successBg:    '#052e16',
  successBorder:'#166534',
  statusBarStyle: 'light-content',
};

// ─── Light theme (Blanc cassé / Warm White) ───────────────────────────────────
export const lightTheme: Theme = {
  bg:          '#F5F5F0',   // blanc cassé chaud
  surface:     '#FAFAF7',   // blanc cassé surface
  surface2:    '#F0F0EA',   // légèrement plus sombre
  surfaceAlt:  '#EBEAE4',   // inputs / sections
  cellBg:      '#F0F0EA',
  cardBg:      '#FAFAF7',
  cardBg2:     '#F0F0EA',
  headerBg:    '#FAFAF7',
  inputBg:     '#EEEEE8',
  border:      '#DDDDD6',
  borderGlass: 'rgba(27,79,216,0.12)',
  borderFocus: '#1B4FD8',
  accent:      '#1B4FD8',
  accentGlow:  '#3B6FE8',
  textPrimary:   '#1A1A1A',
  textSecond:    '#3D3D3D',
  textSecondary: '#3D3D3D',
  textMuted:     '#888880',
  online:  '#16A34A',
  offline: '#DC2626',
  warn:    '#D97706',
  cyan:    '#0891B2',
  gold:    '#D97706',
  red:     '#DC2626',
  pink:    '#BE185D',
  purple:  '#1B4FD8',
  blue:    '#1B4FD8',
  green:   '#16A34A',
  orange:  '#EA580C',
  error:        '#DC2626',
  errorBg:      '#FEF2F2',
  errorBorder:  '#FECACA',
  success:      '#16A34A',
  successBg:    '#F0FDF4',
  successBorder:'#BBF7D0',
  statusBarStyle: 'dark-content',
};

const ThemeContext = createContext<Theme>(darkTheme);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { darkMode } = useAuth();
  const theme = darkMode ? darkTheme : lightTheme;
  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
export type AppTheme = Theme;