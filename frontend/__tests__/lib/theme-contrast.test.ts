import { describe, expect, it } from 'vitest';
import {
  LARGE_TEXT_CONTRAST,
  TEXT_CONTRAST,
  contrastRatio,
  deriveThemeColors,
  ensureContrast,
  getPresetById,
  isDarkColor,
  tokenPresets,
  type ColorTokens,
} from '@/lib/design-tokens';

/**
 * Every text/background pair the blocks paint (D3, ADR-040; QA-019, QA-024):
 * [what, text color, background, minimum].
 */
function paintedPairs(colors: ColorTokens): [string, string, string, number][] {
  const d = deriveThemeColors(colors);
  return [
    ['text on background', d.text, colors.background, TEXT_CONTRAST],
    ['text on surface', d.text, colors.surface, TEXT_CONTRAST],
    ['muted on background', d.textMuted, colors.background, TEXT_CONTRAST],
    ['muted on surface', d.textMuted, colors.surface, TEXT_CONTRAST],
    ['text on primary (buttons, CTA)', d.onPrimary, colors.primary, TEXT_CONTRAST],
    ['muted text on primary (CTA subtitle)', d.onPrimaryMuted, colors.primary, TEXT_CONTRAST],
    ['primary as text on background (dates, CTA button)', d.primaryText, colors.background, TEXT_CONTRAST],
    ['primary as text on surface', d.primaryText, colors.surface, TEXT_CONTRAST],
    ['inverse text (footer, stats, highlighted plan)', d.inverseText, d.inverseBg, TEXT_CONTRAST],
    ['inverse muted (footer links, "/month", stat labels)', d.inverseMuted, d.inverseBg, TEXT_CONTRAST],
    ['stat numbers on inverse (large)', d.inverseAccent, d.inverseBg, LARGE_TEXT_CONTRAST],
    ['form field edge on background (UI)', d.fieldBorder, colors.background, LARGE_TEXT_CONTRAST],
    ['form field edge on surface (UI)', d.fieldBorder, colors.surface, LARGE_TEXT_CONTRAST],
    ['error message on surface', d.error, colors.surface, TEXT_CONTRAST],
  ];
}

describe('theme colors blocks paint with (QA-019, QA-024)', () => {
  it.each(tokenPresets.map((preset) => preset.id))('preset "%s": every pair reaches WCAG AA', (id) => {
    const { colors } = getPresetById(id)!;
    for (const [what, text, background, minimum] of paintedPairs(colors)) {
      expect(contrastRatio(text, background), `${what}: ${text} on ${background}`).toBeGreaterThanOrEqual(minimum);
    }
  });

  it.each(tokenPresets.filter((p) => isDarkColor(p.colors.background)).map((p) => p.id))(
    'dark preset "%s" keeps its footer and inverse sections dark',
    (id) => {
      const { colors } = getPresetById(id)!;
      expect(isDarkColor(deriveThemeColors(colors).inverseBg)).toBe(true);
    },
  );

  it.each(tokenPresets.filter((p) => !isDarkColor(p.colors.background)).map((p) => p.id))(
    'light preset "%s" has a dark inverse section, its text color',
    (id) => {
      const { colors } = getPresetById(id)!;
      expect(deriveThemeColors(colors).inverseBg).toBe(colors.textPrimary);
    },
  );

  it('honours the palette\'s text-on-primary color (QA-024)', () => {
    const { colors } = getPresetById('elegant-dark')!;
    expect(deriveThemeColors(colors).onPrimary).toBe('#0f172a');
  });

  it('keeps colors that already pass, so the palette looks as chosen', () => {
    const { colors } = getPresetById('professional-blue')!;
    const derived = deriveThemeColors(colors);
    expect(derived.text).toBe(colors.textPrimary);
    expect(derived.textMuted).toBe(colors.textSecondary);
    expect(derived.onPrimary).toBe(colors.textOnPrimary);
  });

  it('fixes a custom palette whose choices fail, by the smallest step toward black or white', () => {
    const colors: ColorTokens = { ...getPresetById('default')!.colors, textSecondary: '#d4d4d8', primary: '#10b981', textOnPrimary: '#ffffff' };
    const derived = deriveThemeColors(colors);
    for (const [what, text, background, minimum] of paintedPairs(colors)) {
      expect(contrastRatio(text, background), what).toBeGreaterThanOrEqual(minimum);
    }
    // Darker grey, not black: still a secondary text
    expect(derived.textMuted).not.toBe('#000000');
    expect(contrastRatio(derived.textMuted, '#ffffff')).toBeLessThan(contrastRatio('#000000', '#ffffff'));
  });

  it('holds for any palette whose background and surface are both light or both dark', () => {
    // Deterministic pseudo-random palettes
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const hex = () => `#${Math.floor(random() * 0xffffff).toString(16).padStart(6, '0')}`;
    let checked = 0;
    while (checked < 300) {
      const colors: ColorTokens = {
        primary: hex(), secondary: hex(), accent: hex(), background: hex(), surface: hex(),
        textPrimary: hex(), textSecondary: hex(), textOnPrimary: hex(), border: hex(), success: hex(), error: hex(),
      };
      if (isDarkColor(colors.background) !== isDarkColor(colors.surface)) continue;
      checked += 1;
      for (const [what, text, background, minimum] of paintedPairs(colors)) {
        expect(contrastRatio(text, background), `${what} in ${JSON.stringify(colors)}`).toBeGreaterThanOrEqual(minimum);
      }
    }
  });

  it('ensureContrast leaves a passing color alone and normalizes its spelling', () => {
    expect(ensureContrast('#000', ['#ffffff'])).toBe('#000000');
    expect(ensureContrast('#777777', ['#ffffff'])).not.toBe('#777777');
  });
});
