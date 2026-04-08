/**
 * Design Tokens system — defines colors, typography, spacing, and borders
 * at the page level. Values are injected as CSS custom properties (--bp-*)
 * and consumed by all blocks for visual coherence.
 */

// --- Types ---

export interface ColorTokens {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  textOnPrimary: string;
  border: string;
  success: string;
  error: string;
}

export interface TypographyTokens {
  headingFont: string;
  bodyFont: string;
  baseSize: number;        // px
  scaleRatio: number;      // e.g. 1.25
  headingWeight: number;   // 400-900
  bodyWeight: number;      // 300-600
  lineHeightHeading: number; // e.g. 1.2
  lineHeightBody: number;    // e.g. 1.6
}

export interface SpacingTokens {
  sectionPaddingY: string;
  sectionPaddingX: string;
  maxContentWidth: string;
}

export interface BorderTokens {
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  radiusFull: string;
}

export interface DesignTokens {
  colors: ColorTokens;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  borders: BorderTokens;
}

// --- Defaults ---

export const defaultColorTokens: ColorTokens = {
  primary: '#4f46e5',
  secondary: '#7c3aed',
  accent: '#f59e0b',
  background: '#ffffff',
  surface: '#f8fafc',
  textPrimary: '#0f172a',
  textSecondary: '#64748b',
  textOnPrimary: '#ffffff',
  border: '#e2e8f0',
  success: '#10b981',
  error: '#ef4444',
};

export const defaultTypographyTokens: TypographyTokens = {
  headingFont: 'Inter',
  bodyFont: 'Inter',
  baseSize: 16,
  scaleRatio: 1.25,
  headingWeight: 700,
  bodyWeight: 400,
  lineHeightHeading: 1.2,
  lineHeightBody: 1.6,
};

export const defaultSpacingTokens: SpacingTokens = {
  sectionPaddingY: '80px',
  sectionPaddingX: '24px',
  maxContentWidth: '1200px',
};

export const defaultBorderTokens: BorderTokens = {
  radiusSm: '4px',
  radiusMd: '8px',
  radiusLg: '16px',
  radiusFull: '9999px',
};

export const defaultDesignTokens: DesignTokens = {
  colors: { ...defaultColorTokens },
  typography: { ...defaultTypographyTokens },
  spacing: { ...defaultSpacingTokens },
  borders: { ...defaultBorderTokens },
};

// --- CSS Custom Properties ---

/**
 * Convert DesignTokens to a flat Record of CSS custom properties.
 * These are injected as style= on the canvas/page container.
 */
export function tokensToCssVars(tokens: DesignTokens): Record<string, string> {
  const t = tokens;
  const base = t.typography.baseSize;
  const r = t.typography.scaleRatio;

  return {
    // Colors
    '--bp-color-primary': t.colors.primary,
    '--bp-color-secondary': t.colors.secondary,
    '--bp-color-accent': t.colors.accent,
    '--bp-color-background': t.colors.background,
    '--bp-color-surface': t.colors.surface,
    '--bp-color-text-primary': t.colors.textPrimary,
    '--bp-color-text-secondary': t.colors.textSecondary,
    '--bp-color-text-on-primary': t.colors.textOnPrimary,
    '--bp-color-border': t.colors.border,
    '--bp-color-success': t.colors.success,
    '--bp-color-error': t.colors.error,

    // Typography
    '--bp-font-heading': `'${t.typography.headingFont}', sans-serif`,
    '--bp-font-body': `'${t.typography.bodyFont}', sans-serif`,
    '--bp-font-size-base': `${base}px`,
    '--bp-font-size-sm': `${Math.round(base / r)}px`,
    '--bp-font-size-lg': `${Math.round(base * r)}px`,
    '--bp-font-size-xl': `${Math.round(base * r * r)}px`,
    '--bp-font-size-2xl': `${Math.round(base * r * r * r)}px`,
    '--bp-font-size-3xl': `${Math.round(base * r * r * r * r)}px`,
    '--bp-font-weight-heading': String(t.typography.headingWeight),
    '--bp-font-weight-body': String(t.typography.bodyWeight),
    '--bp-line-height-heading': String(t.typography.lineHeightHeading),
    '--bp-line-height-body': String(t.typography.lineHeightBody),

    // Spacing
    '--bp-spacing-section-y': t.spacing.sectionPaddingY,
    '--bp-spacing-section-x': t.spacing.sectionPaddingX,
    '--bp-max-content-width': t.spacing.maxContentWidth,

    // Borders
    '--bp-radius-sm': t.borders.radiusSm,
    '--bp-radius-md': t.borders.radiusMd,
    '--bp-radius-lg': t.borders.radiusLg,
    '--bp-radius-full': t.borders.radiusFull,
  };
}

// --- Bridge: generate old theme vars from design tokens ---
// This keeps backward compat with blocks that use --theme-* vars.

export function tokensToThemeVars(tokens: DesignTokens): Record<string, string> {
  return {
    '--theme-primary': tokens.colors.primary,
    '--theme-primary-hover': tokens.colors.secondary, // best approximation
    '--theme-secondary': tokens.colors.secondary,
    '--theme-bg': tokens.colors.background,
    '--theme-surface': tokens.colors.surface,
    '--theme-text': tokens.colors.textPrimary,
    '--theme-text-muted': tokens.colors.textSecondary,
    '--theme-border': tokens.colors.border,
    '--theme-accent': tokens.colors.accent,
  };
}

// --- Preset Palettes ---

export interface TokenPreset {
  id: string;
  name: string;
  colors: ColorTokens;
}

export const tokenPresets: TokenPreset[] = [
  {
    id: 'professional-blue',
    name: 'Profesional Azul',
    colors: {
      primary: '#2563eb',
      secondary: '#7c3aed',
      accent: '#f59e0b',
      background: '#ffffff',
      surface: '#f8fafc',
      textPrimary: '#0f172a',
      textSecondary: '#64748b',
      textOnPrimary: '#ffffff',
      border: '#e2e8f0',
      success: '#10b981',
      error: '#ef4444',
    },
  },
  {
    id: 'startup-green',
    name: 'Startup Verde',
    colors: {
      primary: '#10b981',
      secondary: '#06b6d4',
      accent: '#f59e0b',
      background: '#ffffff',
      surface: '#f0fdf4',
      textPrimary: '#064e3b',
      textSecondary: '#6b7280',
      textOnPrimary: '#ffffff',
      border: '#d1fae5',
      success: '#22c55e',
      error: '#ef4444',
    },
  },
  {
    id: 'elegant-dark',
    name: 'Elegante Oscuro',
    colors: {
      primary: '#a78bfa',
      secondary: '#818cf8',
      accent: '#f472b6',
      background: '#0f172a',
      surface: '#1e293b',
      textPrimary: '#f1f5f9',
      textSecondary: '#94a3b8',
      textOnPrimary: '#ffffff',
      border: '#334155',
      success: '#34d399',
      error: '#f87171',
    },
  },
  {
    id: 'warm-orange',
    name: 'Cálido Naranja',
    colors: {
      primary: '#ea580c',
      secondary: '#f59e0b',
      accent: '#e11d48',
      background: '#fffbeb',
      surface: '#fef3c7',
      textPrimary: '#78350f',
      textSecondary: '#92400e',
      textOnPrimary: '#ffffff',
      border: '#fde68a',
      success: '#16a34a',
      error: '#dc2626',
    },
  },
  {
    id: 'minimal-slate',
    name: 'Minimalista',
    colors: {
      primary: '#18181b',
      secondary: '#3f3f46',
      accent: '#6366f1',
      background: '#ffffff',
      surface: '#fafafa',
      textPrimary: '#18181b',
      textSecondary: '#71717a',
      textOnPrimary: '#ffffff',
      border: '#e4e4e7',
      success: '#22c55e',
      error: '#ef4444',
    },
  },
  {
    id: 'ocean-teal',
    name: 'Océano',
    colors: {
      primary: '#0891b2',
      secondary: '#0d9488',
      accent: '#f59e0b',
      background: '#ffffff',
      surface: '#f0fdfa',
      textPrimary: '#134e4a',
      textSecondary: '#5eead4',
      textOnPrimary: '#ffffff',
      border: '#ccfbf1',
      success: '#14b8a6',
      error: '#ef4444',
    },
  },
];

// --- Scale Ratio Presets ---

export const scaleRatios = [
  { value: 1.2, label: 'Minor Third (1.200)' },
  { value: 1.25, label: 'Major Third (1.250)' },
  { value: 1.333, label: 'Perfect Fourth (1.333)' },
  { value: 1.5, label: 'Perfect Fifth (1.500)' },
  { value: 1.618, label: 'Golden Ratio (1.618)' },
];

// --- Google Fonts list (popular subset) ---

export const googleFonts = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Raleway',
  'Source Sans 3',
  'Nunito',
  'Playfair Display',
  'Merriweather',
  'DM Sans',
  'Space Grotesk',
  'Outfit',
  'Plus Jakarta Sans',
  'Manrope',
  'Sora',
  'Work Sans',
  'Archivo',
  'Libre Baskerville',
];

// --- WCAG Contrast Check ---

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').toLowerCase();
  // Expand shorthand (#fff → ffffff)
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (!/^[0-9a-f]{6}$/.test(h)) {
    return [0, 0, 0]; // Safe fallback for invalid input
  }
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function contrastRatio(hex1: string, hex2: string): number {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const l1 = luminance(r1, g1, b1);
  const l2 = luminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Check if contrast meets WCAG AA (4.5:1 for normal text) */
export function meetsWcagAA(textColor: string, bgColor: string): boolean {
  return contrastRatio(textColor, bgColor) >= 4.5;
}

// --- API mapping helpers ---

/** Convert frontend camelCase tokens to backend snake_case JSON */
export function tokensToApi(tokens: DesignTokens): Record<string, unknown> {
  return {
    colors: {
      primary: tokens.colors.primary,
      secondary: tokens.colors.secondary,
      accent: tokens.colors.accent,
      background: tokens.colors.background,
      surface: tokens.colors.surface,
      text_primary: tokens.colors.textPrimary,
      text_secondary: tokens.colors.textSecondary,
      text_on_primary: tokens.colors.textOnPrimary,
      border: tokens.colors.border,
      success: tokens.colors.success,
      error: tokens.colors.error,
    },
    typography: {
      heading_font: tokens.typography.headingFont,
      body_font: tokens.typography.bodyFont,
      base_size: tokens.typography.baseSize,
      scale_ratio: tokens.typography.scaleRatio,
      heading_weight: tokens.typography.headingWeight,
      body_weight: tokens.typography.bodyWeight,
      line_height_heading: tokens.typography.lineHeightHeading,
      line_height_body: tokens.typography.lineHeightBody,
    },
    spacing: {
      section_padding_y: tokens.spacing.sectionPaddingY,
      section_padding_x: tokens.spacing.sectionPaddingX,
      max_content_width: tokens.spacing.maxContentWidth,
    },
    borders: {
      radius_sm: tokens.borders.radiusSm,
      radius_md: tokens.borders.radiusMd,
      radius_lg: tokens.borders.radiusLg,
      radius_full: tokens.borders.radiusFull,
    },
  };
}

/** Convert backend snake_case JSON to frontend camelCase tokens */
export function apiToTokens(raw: Record<string, unknown> | null | undefined): DesignTokens | undefined {
  if (!raw || Object.keys(raw).length === 0) return undefined;
  const c = raw.colors as Record<string, string> | undefined;
  const t = raw.typography as Record<string, unknown> | undefined;
  const s = raw.spacing as Record<string, string> | undefined;
  const b = raw.borders as Record<string, string> | undefined;

  return {
    colors: c ? {
      primary: c.primary ?? defaultColorTokens.primary,
      secondary: c.secondary ?? defaultColorTokens.secondary,
      accent: c.accent ?? defaultColorTokens.accent,
      background: c.background ?? defaultColorTokens.background,
      surface: c.surface ?? defaultColorTokens.surface,
      textPrimary: c.text_primary ?? defaultColorTokens.textPrimary,
      textSecondary: c.text_secondary ?? defaultColorTokens.textSecondary,
      textOnPrimary: c.text_on_primary ?? defaultColorTokens.textOnPrimary,
      border: c.border ?? defaultColorTokens.border,
      success: c.success ?? defaultColorTokens.success,
      error: c.error ?? defaultColorTokens.error,
    } : { ...defaultColorTokens },
    typography: t ? {
      headingFont: (t.heading_font as string) ?? defaultTypographyTokens.headingFont,
      bodyFont: (t.body_font as string) ?? defaultTypographyTokens.bodyFont,
      baseSize: (t.base_size as number) ?? defaultTypographyTokens.baseSize,
      scaleRatio: (t.scale_ratio as number) ?? defaultTypographyTokens.scaleRatio,
      headingWeight: (t.heading_weight as number) ?? defaultTypographyTokens.headingWeight,
      bodyWeight: (t.body_weight as number) ?? defaultTypographyTokens.bodyWeight,
      lineHeightHeading: (t.line_height_heading as number) ?? defaultTypographyTokens.lineHeightHeading,
      lineHeightBody: (t.line_height_body as number) ?? defaultTypographyTokens.lineHeightBody,
    } : { ...defaultTypographyTokens },
    spacing: s ? {
      sectionPaddingY: s.section_padding_y ?? defaultSpacingTokens.sectionPaddingY,
      sectionPaddingX: s.section_padding_x ?? defaultSpacingTokens.sectionPaddingX,
      maxContentWidth: s.max_content_width ?? defaultSpacingTokens.maxContentWidth,
    } : { ...defaultSpacingTokens },
    borders: b ? {
      radiusSm: b.radius_sm ?? defaultBorderTokens.radiusSm,
      radiusMd: b.radius_md ?? defaultBorderTokens.radiusMd,
      radiusLg: b.radius_lg ?? defaultBorderTokens.radiusLg,
      radiusFull: b.radius_full ?? defaultBorderTokens.radiusFull,
    } : { ...defaultBorderTokens },
  };
}
