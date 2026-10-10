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

/** The colors of the 'default' preset: what a page looked like before it chose anything. */
export const defaultColorTokens: ColorTokens = {
  primary: '#4f46e5',
  secondary: '#8b5cf6',
  accent: '#6366f1',
  background: '#ffffff',
  surface: '#f9fafb',
  textPrimary: '#18181b',
  textSecondary: '#71717a',
  textOnPrimary: '#ffffff',
  border: '#e4e4e7',
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

export function cloneDesignTokens(tokens: DesignTokens): DesignTokens {
  return {
    colors: { ...tokens.colors },
    typography: { ...tokens.typography },
    spacing: { ...tokens.spacing },
    borders: { ...tokens.borders },
  };
}

// --- CSS Custom Properties ---

/**
 * Convert DesignTokens to a flat Record of CSS custom properties for
 * typography, spacing and borders. Colors are not here: they go out as
 * --theme-* (tokensToThemeVars), because --bp-color-* is the editor
 * chrome's namespace (app/globals.css) and a page must not repaint it.
 * These are injected as style= on the canvas/page container.
 */
export function tokensToCssVars(tokens: DesignTokens): Record<string, string> {
  const t = tokens;
  const base = t.typography.baseSize;
  const r = t.typography.scaleRatio;

  return {
    // Typography
    '--bp-font-heading': fontStack(t.typography.headingFont),
    '--bp-font-body': fontStack(t.typography.bodyFont),
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

// --- Page colors: the --theme-* variables blocks read ---

/** WCAG AA minimums: body text, and large text (24px, or 18.66px bold) or UI parts. */
export const TEXT_CONTRAST = 4.5;
export const LARGE_TEXT_CONTRAST = 3;

/**
 * The colors blocks paint with, derived from the palette so that every text
 * reaches WCAG AA on the background it is drawn on (D3, ADR-041). A color that
 * already passes is kept as chosen; one that doesn't is moved toward black or
 * white just enough to pass, so the page keeps the palette's look.
 *
 * "Inverse" sections (footer, statistics, the highlighted pricing plan) stand
 * out from the page: on a light palette they are dark (the text color), on a
 * dark palette they stay dark and use the surface color.
 */
export interface ThemeColors {
  text: string;
  textMuted: string;
  /** Text and icons on a primary-colored background (buttons, CTA section) */
  onPrimary: string;
  onPrimaryMuted: string;
  /** The primary color used as text (links, dates, a button on the page background) */
  primaryText: string;
  inverseBg: string;
  inverseText: string;
  inverseMuted: string;
  inverseBorder: string;
  /** Large numbers on the inverse background */
  inverseAccent: string;
  /** Edge of form fields: a UI part, 3:1 against the page and the cards */
  fieldBorder: string;
  error: string;
}

export function isDarkColor(hex: string): boolean {
  return contrastRatio(hex, '#000000') < contrastRatio(hex, '#ffffff');
}

export function deriveThemeColors(colors: ColorTokens): ThemeColors {
  const pageBackgrounds = [colors.background, colors.surface];
  const inverseBg = isDarkColor(colors.background) ? colors.surface : colors.textPrimary;
  const inverseText = ensureContrast(isDarkColor(colors.background) ? colors.textPrimary : colors.background, [inverseBg]);
  const onPrimary = ensureContrast(colors.textOnPrimary, [colors.primary]);
  return {
    text: ensureContrast(colors.textPrimary, pageBackgrounds),
    textMuted: ensureContrast(colors.textSecondary, pageBackgrounds),
    onPrimary,
    onPrimaryMuted: ensureContrast(mixColors(onPrimary, colors.primary, 0.85), [colors.primary]),
    primaryText: ensureContrast(colors.primary, pageBackgrounds),
    inverseBg: toHex(hexToRgb(inverseBg)),
    inverseText,
    inverseMuted: ensureContrast(mixColors(inverseText, inverseBg, 0.7), [inverseBg]),
    inverseBorder: mixColors(inverseText, inverseBg, 0.2),
    inverseAccent: ensureContrast(colors.accent, [inverseBg], LARGE_TEXT_CONTRAST),
    fieldBorder: ensureContrast(colors.border, pageBackgrounds, LARGE_TEXT_CONTRAST),
    error: ensureContrast(colors.error, pageBackgrounds),
  };
}

export function tokensToThemeVars(tokens: DesignTokens): Record<string, string> {
  const derived = deriveThemeColors(tokens.colors);
  return {
    '--theme-primary': tokens.colors.primary,
    '--theme-secondary': tokens.colors.secondary,
    '--theme-bg': tokens.colors.background,
    '--theme-surface': tokens.colors.surface,
    '--theme-text': derived.text,
    '--theme-text-muted': derived.textMuted,
    '--theme-border': tokens.colors.border,
    '--theme-accent': tokens.colors.accent,
    '--theme-text-on-primary': derived.onPrimary,
    '--theme-text-on-primary-muted': derived.onPrimaryMuted,
    '--theme-primary-text': derived.primaryText,
    '--theme-inverse-bg': derived.inverseBg,
    '--theme-inverse-text': derived.inverseText,
    '--theme-inverse-muted': derived.inverseMuted,
    '--theme-inverse-border': derived.inverseBorder,
    '--theme-inverse-accent': derived.inverseAccent,
    '--theme-field-border': derived.fieldBorder,
    '--theme-error': derived.error,
  };
}

// --- Preset Palettes ---

/** A palette to start from. Its name is the message `designTokens.presets.<id>` (ES/EN). */
export interface TokenPreset {
  id: string;
  colors: ColorTokens;
}

/** The preset whose colors are exactly `colors`, if any (the active one in the Styles panel). */
export function matchingPresetId(colors: ColorTokens): string | null {
  const keys = Object.keys(colors) as (keyof ColorTokens)[];
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return tokenPresets.find((preset) => keys.every((key) => same(preset.colors[key], colors[key])))?.id ?? null;
}

export const tokenPresets: TokenPreset[] = [
  {
    id: 'professional-blue',
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
    colors: {
      primary: '#10b981',
      secondary: '#06b6d4',
      accent: '#f59e0b',
      background: '#ffffff',
      surface: '#f0fdf4',
      textPrimary: '#064e3b',
      textSecondary: '#6b7280',
      textOnPrimary: '#0f172a',
      border: '#d1fae5',
      success: '#22c55e',
      error: '#ef4444',
    },
  },
  {
    id: 'elegant-dark',
    colors: {
      primary: '#a78bfa',
      secondary: '#818cf8',
      accent: '#f472b6',
      background: '#0f172a',
      surface: '#1e293b',
      textPrimary: '#f1f5f9',
      textSecondary: '#94a3b8',
      textOnPrimary: '#0f172a',
      border: '#334155',
      success: '#34d399',
      error: '#f87171',
    },
  },
  {
    id: 'warm-orange',
    colors: {
      primary: '#ea580c',
      secondary: '#f59e0b',
      accent: '#e11d48',
      background: '#fffbeb',
      surface: '#fef3c7',
      textPrimary: '#78350f',
      textSecondary: '#92400e',
      textOnPrimary: '#0f172a',
      border: '#fde68a',
      success: '#16a34a',
      error: '#dc2626',
    },
  },
  {
    id: 'minimal-slate',
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
    colors: {
      primary: '#0891b2',
      secondary: '#0d9488',
      accent: '#f59e0b',
      background: '#ffffff',
      surface: '#f0fdfa',
      textPrimary: '#134e4a',
      textSecondary: '#0f766e',
      textOnPrimary: '#0f172a',
      border: '#ccfbf1',
      success: '#14b8a6',
      error: '#ef4444',
    },
  },
  // The former fixed themes (theme_id), now presets like any other. Their ids
  // are the old theme ids, so a template or an old page can name one.
  {
    id: 'default',
    colors: {
      primary: '#4f46e5',
      secondary: '#8b5cf6',
      accent: '#6366f1',
      background: '#ffffff',
      surface: '#f9fafb',
      textPrimary: '#18181b',
      textSecondary: '#71717a',
      textOnPrimary: '#ffffff',
      border: '#e4e4e7',
      success: '#10b981',
      error: '#ef4444',
    },
  },
  {
    id: 'ocean',
    colors: {
      primary: '#0891b2',
      secondary: '#06b6d4',
      accent: '#14b8a6',
      background: '#ffffff',
      surface: '#f0fdfa',
      textPrimary: '#134e4a',
      textSecondary: '#0f766e',
      textOnPrimary: '#0f172a',
      border: '#ccfbf1',
      success: '#10b981',
      error: '#ef4444',
    },
  },
  {
    id: 'sunset',
    colors: {
      primary: '#ea580c',
      secondary: '#f97316',
      accent: '#f59e0b',
      background: '#fffbeb',
      surface: '#fef3c7',
      textPrimary: '#78350f',
      textSecondary: '#92400e',
      textOnPrimary: '#0f172a',
      border: '#fde68a',
      success: '#10b981',
      error: '#ef4444',
    },
  },
  {
    id: 'forest',
    colors: {
      primary: '#16a34a',
      secondary: '#22c55e',
      accent: '#4ade80',
      background: '#ffffff',
      surface: '#f0fdf4',
      textPrimary: '#14532d',
      textSecondary: '#166534',
      textOnPrimary: '#0f172a',
      border: '#bbf7d0',
      success: '#10b981',
      error: '#ef4444',
    },
  },
  {
    id: 'dark',
    colors: {
      primary: '#818cf8',
      secondary: '#a78bfa',
      accent: '#c084fc',
      background: '#18181b',
      surface: '#27272a',
      textPrimary: '#fafafa',
      textSecondary: '#a1a1aa',
      textOnPrimary: '#0f172a',
      border: '#3f3f46',
      success: '#10b981',
      error: '#ef4444',
    },
  },
  {
    id: 'slate',
    colors: {
      primary: '#14b8a6',
      secondary: '#06b6d4',
      accent: '#2dd4bf',
      background: '#0f172a',
      surface: '#1e293b',
      textPrimary: '#f1f5f9',
      textSecondary: '#94a3b8',
      textOnPrimary: '#0f172a',
      border: '#334155',
      success: '#10b981',
      error: '#ef4444',
    },
  },
  {
    id: 'ember',
    colors: {
      primary: '#ea580c',
      secondary: '#f59e0b',
      accent: '#fb923c',
      background: '#0c0a09',
      surface: '#1c1917',
      textPrimary: '#fafaf9',
      textSecondary: '#a8a29e',
      textOnPrimary: '#0f172a',
      border: '#292524',
      success: '#10b981',
      error: '#ef4444',
    },
  },
  {
    id: 'rose',
    colors: {
      primary: '#e11d48',
      secondary: '#f43f5e',
      accent: '#fb7185',
      background: '#ffffff',
      surface: '#fff1f2',
      textPrimary: '#1c1917',
      textSecondary: '#57534e',
      textOnPrimary: '#ffffff',
      border: '#fecdd3',
      success: '#10b981',
      error: '#ef4444',
    },
  },
];

export function getPresetById(id: string): TokenPreset | undefined {
  return tokenPresets.find((preset) => preset.id === id);
}

/** Full tokens for a preset: its colors, the default typography, spacing and borders. */
export function presetTokens(id: string): DesignTokens {
  const preset = getPresetById(id);
  return { ...cloneDesignTokens(defaultDesignTokens), colors: { ...(preset ? preset.colors : defaultColorTokens) } };
}

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

const serifFonts = new Set(['Playfair Display', 'Merriweather', 'Libre Baskerville']);

/** CSS variable that lib/page-fonts.ts defines for a font of googleFonts. */
export function fontVariable(name: string): string {
  return `--font-page-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/**
 * font-family for a theme font: the self-hosted copy when it is one of
 * googleFonts, otherwise the name itself (only works if installed locally).
 */
export function fontStack(name: string): string {
  const family = `'${name.replace(/['"\\;{}<>]/g, '')}'`;
  const generic = serifFonts.has(name) ? 'serif' : 'sans-serif';
  return googleFonts.includes(name)
    ? `var(${fontVariable(name)}, ${family}), ${generic}`
    : `${family}, ${generic}`;
}

// --- WCAG Contrast Check ---

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').toLowerCase();
  // Expand shorthand (#fff → ffffff)
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  // #rrggbbaa (the server accepts it): contrast is judged on the opaque color
  if (h.length === 8) {
    h = h.slice(0, 6);
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

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** `weight` of `color` and the rest of `other`, mixed in sRGB (like CSS color-mix). */
export function mixColors(color: string, other: string, weight: number): string {
  const a = hexToRgb(color);
  const b = hexToRgb(other);
  return toHex([0, 1, 2].map((i) => a[i] * weight + b[i] * (1 - weight)) as [number, number, number]);
}

function worstContrast(color: string, backgrounds: string[]): number {
  return Math.min(...backgrounds.map((background) => contrastRatio(color, background)));
}

/**
 * `color` if it reaches `minimum` on every one of `backgrounds`; otherwise the
 * least change of it toward black or white that does. When nothing does
 * (backgrounds of opposite lightness), the better of black and white.
 */
export function ensureContrast(color: string, backgrounds: string[], minimum: number = TEXT_CONTRAST): string {
  const original = toHex(hexToRgb(color));
  if (worstContrast(original, backgrounds) >= minimum) return original;
  const black = '#000000';
  const white = '#ffffff';
  const target = worstContrast(black, backgrounds) >= worstContrast(white, backgrounds) ? black : white;
  for (let step = 1; step <= 50; step += 1) {
    const candidate = mixColors(target, original, step / 50);
    if (worstContrast(candidate, backgrounds) >= minimum) return candidate;
  }
  return target;
}

/** Check if contrast meets WCAG AA (4.5:1 for normal text) */
export function meetsWcagAA(textColor: string, bgColor: string): boolean {
  return contrastRatio(textColor, bgColor) >= 4.5;
}

/**
 * The text/background pairs the blocks actually draw: text and secondary text
 * on the page background and on cards (surface), and the text of primary buttons.
 */
export const contrastPairs = [
  { id: 'textOnBackground', text: 'textPrimary', background: 'background' },
  { id: 'textOnSurface', text: 'textPrimary', background: 'surface' },
  { id: 'secondaryOnBackground', text: 'textSecondary', background: 'background' },
  { id: 'secondaryOnSurface', text: 'textSecondary', background: 'surface' },
  { id: 'onPrimary', text: 'textOnPrimary', background: 'primary' },
] as const satisfies readonly { id: string; text: keyof ColorTokens; background: keyof ColorTokens }[];

export type ContrastPairId = (typeof contrastPairs)[number]['id'];

export interface ContrastIssue {
  id: ContrastPairId;
  ratio: number;
}

const COMPLETE_HEX = /^#[0-9a-f]{6}$/i;

/** Pairs of the palette below WCAG AA (4.5:1). Colors still being typed are skipped. */
export function contrastIssues(colors: ColorTokens): ContrastIssue[] {
  return contrastPairs.flatMap(({ id, text, background }) => {
    if (!COMPLETE_HEX.test(colors[text]) || !COMPLETE_HEX.test(colors[background])) return [];
    const ratio = contrastRatio(colors[text], colors[background]);
    return ratio >= 4.5 ? [] : [{ id, ratio }];
  });
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

/**
 * Convert backend snake_case JSON to frontend camelCase tokens. Missing keys
 * get the defaults, so `{}` (a page that never saved tokens) is the default theme.
 */
export function apiToTokens(raw: Record<string, unknown> | null | undefined): DesignTokens {
  if (!raw || Object.keys(raw).length === 0) return cloneDesignTokens(defaultDesignTokens);
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
