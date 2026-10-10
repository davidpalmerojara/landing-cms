import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import SeoPanel from '@/components/editor/SeoPanel';
import DesignTokensPanel from '@/components/editor/DesignTokensPanel';
import { useEditorStore } from '@/store/editor-store';
import { tokenPresets, presetTokens } from '@/lib/design-tokens';
import { MESSAGES } from '@/lib/i18n';
import { SITE_URL } from '@/lib/site-url';
import { click, makePage, render, resetEditorStore, type RenderResult } from '../mobile-editor/test-utils';

let view: RenderResult;
afterEach(() => view.unmount());

describe('SeoPanel', () => {
  it('offers only the Open Graph types the server accepts, under a translated label (QA-009, QA-081)', () => {
    resetEditorStore({ ...makePage(), seo: { ...makePage().seo, ogType: 'product' } });
    view = render(<SeoPanel />, 'en');
    const select = view.container.querySelector<HTMLSelectElement>('#seo-og-type')!;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['website', 'article']);
    // An old "product" shows as what the page really renders
    expect(select.value).toBe('website');
    expect(view.container.querySelector('label[for="seo-og-type"]')?.textContent).toBe(MESSAGES.en.seo.ogType);
    expect(MESSAGES.en.seo.ogType).not.toMatch(/OG/);
  });

  it('draws the "hide from search engines" knob inside its track in both states (QA-076)', () => {
    resetEditorStore(makePage());
    view = render(<SeoPanel />);
    const toggle = view.container.querySelector<HTMLButtonElement>('#seo-noindex')!;
    // button > track > knob (the button itself is the 44 px touch target, EDITOR3-002)
    const knob = toggle.querySelector('span > span')!;
    expect(knob.className).toMatch(/\bleft-0\.5\b/);
    expect(knob.className).toContain('translate-x-0');
    click(toggle);
    expect(knob.className).toContain('translate-x-4');
  });

  it('EDITOR3-002: the SEO switch and fields are 44 px on touch screens', () => {
    resetEditorStore(makePage());
    view = render(<SeoPanel />);
    expect(view.container.querySelector('#seo-noindex')?.className).toMatch(/pointer-coarse:h-11/);
    expect(view.container.querySelector('#seo-language')?.className).toContain('pointer-coarse:min-h-11');
    for (const input of view.container.querySelectorAll('input[type="text"], textarea')) {
      expect(input.className).toContain('pointer-coarse:min-h-11');
    }
  });

  it('shows this deployment\'s real address, not a made-up host (QA-085, QA-097)', () => {
    resetEditorStore({ ...makePage(), slug: 'mi-landing' });
    view = render(<SeoPanel />);
    expect(view.container.innerHTML).not.toContain('paxl.com');
    const canonical = Array.from(view.container.querySelectorAll('input')).find((input) => input.placeholder.includes('/p/'))!;
    expect(canonical.placeholder).toBe(`${SITE_URL}/p/mi-landing`);
  });

  it('edits the page language, used for <html lang> of the published page (QA-091)', () => {
    resetEditorStore(makePage());
    view = render(<SeoPanel />);
    const select = view.container.querySelector<HTMLSelectElement>('#seo-language')!;
    expect(select.value).toBe('es');
    act(() => {
      select.value = 'en';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(useEditorStore.getState().page.seo.language).toBe('en');
  });
});

describe('DesignTokensPanel palettes (QA-046)', () => {
  it('names every palette in the interface language, with no near-duplicates', () => {
    resetEditorStore(makePage());
    view = render(<DesignTokensPanel />, 'en');
    const names = Array.from(view.container.querySelectorAll('button[aria-pressed]')).map((b) => b.textContent);
    expect(names).toEqual(tokenPresets.map((p) => MESSAGES.en.designTokens.presets[p.id as keyof typeof MESSAGES.en.designTokens.presets]));
    expect(new Set(names).size).toBe(names.length);
    expect(names.join(' ')).not.toMatch(/Oscuro|Océano|Cálido/);
  });

  it('marks the palette in use as pressed', () => {
    resetEditorStore({ ...makePage(), designTokens: presetTokens('slate') });
    view = render(<DesignTokensPanel />);
    const pressed = Array.from(view.container.querySelectorAll('button[aria-pressed="true"]')).map((b) => b.textContent);
    expect(pressed).toEqual([MESSAGES.es.designTokens.presets.slate]);
  });

  it('says contrast problems are fixed on the page', () => {
    resetEditorStore(makePage());
    view = render(<DesignTokensPanel />);
    act(() => useEditorStore.getState().updateDesignTokenColor('textSecondary', '#d4d4d8'));
    expect(view.container.textContent).toContain(MESSAGES.es.designTokens.contrastAutoFixed);
  });
});
