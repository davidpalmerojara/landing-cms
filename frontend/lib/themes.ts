export interface ThemeColors {
  primary: string;
  primaryHover: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
}

export interface Theme {
  id: string;
  name: string;
  colors: ThemeColors;
}

export const defaultCustomThemeColors: ThemeColors = {
  primary: '#4f46e5',
  primaryHover: '#4338ca',
  secondary: '#8b5cf6',
  background: '#ffffff',
  surface: '#f9fafb',
  text: '#18181b',
  textMuted: '#71717a',
  border: '#e4e4e7',
  accent: '#6366f1',
};

export const themes: Theme[] = [
  {
    id: 'default',
    name: 'Default',
    colors: {
      primary: '#4f46e5',
      primaryHover: '#4338ca',
      secondary: '#8b5cf6',
      background: '#ffffff',
      surface: '#f9fafb',
      text: '#18181b',
      textMuted: '#71717a',
      border: '#e4e4e7',
      accent: '#6366f1',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    colors: {
      primary: '#0891b2',
      primaryHover: '#0e7490',
      secondary: '#06b6d4',
      background: '#ffffff',
      surface: '#f0fdfa',
      text: '#134e4a',
      textMuted: '#5eead4',
      border: '#ccfbf1',
      accent: '#14b8a6',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    colors: {
      primary: '#ea580c',
      primaryHover: '#c2410c',
      secondary: '#f97316',
      background: '#fffbeb',
      surface: '#fef3c7',
      text: '#78350f',
      textMuted: '#92400e',
      border: '#fde68a',
      accent: '#f59e0b',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    colors: {
      primary: '#16a34a',
      primaryHover: '#15803d',
      secondary: '#22c55e',
      background: '#ffffff',
      surface: '#f0fdf4',
      text: '#14532d',
      textMuted: '#166534',
      border: '#bbf7d0',
      accent: '#4ade80',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    colors: {
      primary: '#818cf8',
      primaryHover: '#6366f1',
      secondary: '#a78bfa',
      background: '#18181b',
      surface: '#27272a',
      text: '#fafafa',
      textMuted: '#a1a1aa',
      border: '#3f3f46',
      accent: '#c084fc',
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    colors: {
      primary: '#14b8a6',
      primaryHover: '#0d9488',
      secondary: '#06b6d4',
      background: '#0f172a',
      surface: '#1e293b',
      text: '#f1f5f9',
      textMuted: '#94a3b8',
      border: '#334155',
      accent: '#2dd4bf',
    },
  },
  {
    id: 'ember',
    name: 'Ember',
    colors: {
      primary: '#ea580c',
      primaryHover: '#c2410c',
      secondary: '#f59e0b',
      background: '#0c0a09',
      surface: '#1c1917',
      text: '#fafaf9',
      textMuted: '#a8a29e',
      border: '#292524',
      accent: '#fb923c',
    },
  },
  {
    id: 'rose',
    name: 'Rose',
    colors: {
      primary: '#e11d48',
      primaryHover: '#be123c',
      secondary: '#f43f5e',
      background: '#ffffff',
      surface: '#fff1f2',
      text: '#1c1917',
      textMuted: '#78716c',
      border: '#fecdd3',
      accent: '#fb7185',
    },
  },
];

export function getThemeById(id: string, customColors?: ThemeColors): Theme {
  if (id === 'custom' && customColors) {
    return { id: 'custom', name: 'Custom', colors: customColors };
  }
  return themes.find((t) => t.id === id) || themes[0];
}
