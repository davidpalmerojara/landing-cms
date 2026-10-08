import type { CSSProperties } from 'react';
import { getThemeById } from '@/lib/themes';
import type { ThemeColors } from '@/lib/themes';
import { defaultDesignTokens, tokensToCssVars, tokensToThemeVars } from '@/lib/design-tokens';
import type { DesignTokens } from '@/lib/design-tokens';

interface PageThemeInput {
  themeId?: string | null;
  customTheme?: ThemeColors | null;
  /** Already converted with apiToTokens(): undefined means "the page has no tokens". */
  designTokens?: DesignTokens;
}

/**
 * CSS variables that render a page's blocks. Single source for the editor
 * canvas, the mobile editor, the preview and the public page, so all of
 * them resolve the theme the same way.
 *
 * Precedence: design tokens, when the page has them, drive every color.
 * Otherwise the legacy theme (theme_id + custom_theme) provides the
 * --theme-* colors blocks read, and typography falls back to defaults.
 */
export function pageThemeVars({ themeId, customTheme, designTokens }: PageThemeInput): CSSProperties {
  const bpVars = tokensToCssVars(designTokens ?? defaultDesignTokens);

  if (designTokens) {
    return { ...bpVars, ...tokensToThemeVars(designTokens) } as CSSProperties;
  }

  const { colors } = getThemeById(themeId || 'default', customTheme ?? undefined);
  return {
    ...bpVars,
    '--theme-primary': colors.primary,
    '--theme-primary-hover': colors.primaryHover,
    '--theme-secondary': colors.secondary,
    '--theme-bg': colors.background,
    '--theme-surface': colors.surface,
    '--theme-text': colors.text,
    '--theme-text-muted': colors.textMuted,
    '--theme-border': colors.border,
    '--theme-accent': colors.accent,
  } as CSSProperties;
}
