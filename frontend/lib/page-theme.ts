import type { CSSProperties } from 'react';
import { tokensToCssVars, tokensToThemeVars } from '@/lib/design-tokens';
import type { DesignTokens } from '@/lib/design-tokens';

/**
 * CSS variables that render a page's blocks. Single source for the editor
 * canvas, the mobile editor, the preview, the dashboard thumbnails and the
 * public page, so all of them resolve the theme the same way.
 *
 * The page's design tokens are its whole theme: colors go out as the
 * --theme-* variables blocks read, typography/spacing/borders as --bp-*.
 * `tokens` come from apiToTokens(), so a page that saved none (stored as {})
 * already carries the defaults.
 */
export function pageThemeVars(tokens: DesignTokens): CSSProperties {
  return {
    ...tokensToCssVars(tokens),
    ...tokensToThemeVars(tokens),
    // Text a block doesn't style itself uses the theme's body font, not the editor's
    fontFamily: 'var(--bp-font-body)',
  } as CSSProperties;
}
