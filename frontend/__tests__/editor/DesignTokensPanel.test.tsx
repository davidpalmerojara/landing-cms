import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import DesignTokensPanel from '@/components/editor/DesignTokensPanel';
import { useEditorStore } from '@/store/editor-store';
import { click, makePage, render, resetEditorStore, type RenderResult } from '../mobile-editor/test-utils';

describe('DesignTokensPanel contrast warnings', () => {
  let view: RenderResult;

  beforeEach(() => {
    resetEditorStore(makePage());
    view = render(<DesignTokensPanel />);
  });

  afterEach(() => view.unmount());

  const warnings = () =>
    Array.from(view.container.querySelectorAll('[aria-live="polite"] > div')).map((el) => el.textContent ?? '');

  it('shows no warning for the default palette', () => {
    expect(warnings()).toEqual([]);
  });

  it('warns when the secondary text is too faint on the background and on the surface', () => {
    act(() => useEditorStore.getState().updateDesignTokenColor('textSecondary', '#cbd5e1'));

    const found = warnings();
    expect(found).toHaveLength(2);
    expect(found[0]).toContain('Texto secundario sobre fondo');
    expect(found[0]).toContain('Contraste bajo');
    expect(found[1]).toContain('Texto secundario sobre superficie');
  });

  it('still warns about the primary text and the text on primary buttons', () => {
    act(() => {
      useEditorStore.getState().updateDesignTokenColor('textPrimary', '#e4e4e7');
      useEditorStore.getState().updateDesignTokenColor('textOnPrimary', '#6366f1');
    });

    const text = warnings().join('|');
    expect(text).toContain('Texto principal sobre fondo');
    expect(text).toContain('Texto principal sobre superficie');
    expect(text).toContain('Texto sobre color primario');
  });

  it('names the two inputs of each color differently and announces the open state of sections', () => {
    const names = Array.from(view.container.querySelectorAll('input[aria-label]')).map((el) => el.getAttribute('aria-label'));

    expect(new Set(names).size).toBe(names.length);
    const toggle = view.container.querySelector('button[aria-expanded="true"]') as HTMLElement;
    click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
