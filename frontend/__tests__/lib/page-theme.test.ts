import { describe, it, expect } from 'vitest';
import { pageThemeVars } from '@/lib/page-theme';
import { apiToTokens, defaultDesignTokens } from '@/lib/design-tokens';
import { getThemeById } from '@/lib/themes';

type Vars = Record<string, string>;

describe('pageThemeVars', () => {
  const dark = getThemeById('dark');

  it('uses the legacy theme colors when the page has no design tokens', () => {
    const vars = pageThemeVars({ themeId: 'dark' }) as Vars;

    expect(vars['--theme-bg']).toBe(dark.colors.background);
    expect(vars['--theme-text']).toBe(dark.colors.text);
    expect(vars['--theme-primary']).toBe(dark.colors.primary);
  });

  it('lets design tokens override the legacy theme', () => {
    const tokens = {
      ...defaultDesignTokens,
      colors: { ...defaultDesignTokens.colors, background: '#123456' },
    };

    const vars = pageThemeVars({ themeId: 'dark', designTokens: tokens }) as Vars;

    expect(vars['--theme-bg']).toBe('#123456');
  });

  it('treats the empty token object the API sends as "no tokens"', () => {
    // The backend stores design_tokens = {} by default. Checking the raw
    // value made published pages ignore their template theme.
    const vars = pageThemeVars({ themeId: 'dark', designTokens: apiToTokens({}) }) as Vars;

    expect(vars['--theme-bg']).toBe(dark.colors.background);
  });

  it('always provides typography variables', () => {
    const vars = pageThemeVars({ themeId: 'dark' }) as Vars;

    expect(vars['--bp-font-heading']).toBeDefined();
  });

  it('falls back to the default theme for unknown or missing ids', () => {
    const fallback = getThemeById('default');

    expect((pageThemeVars({}) as Vars)['--theme-bg']).toBe(fallback.colors.background);
  });
});
