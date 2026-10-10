import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import Inspector from '@/components/inspector/Inspector';
import ColorField from '@/components/inspector/ColorField';
import { readBlockBackground } from '@/hooks/useBlockBackground';
import { useEditorStore } from '@/store/editor-store';
import { styleGroups } from '@/lib/block-styles-config';
import { translateStyleGroupLabel } from '@/lib/editor-i18n';
import { click, makeBlock, makePage, render, resetEditorStore, type RenderResult } from '../mobile-editor/test-utils';

let view: RenderResult;

afterEach(() => {
  view.unmount();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function openInspector(locale: 'es' | 'en' = 'es') {
  resetEditorStore(makePage([
    makeBlock('hero', { title: 'Hola' }, { id: 'hero' }),
    makeBlock('logoCloud', {}, { id: 'logos' }),
  ]));
  useEditorStore.setState({ selectedBlockId: 'logos' });
  view = render(<Inspector />, locale);
}

describe('inspector labels (QA-081)', () => {
  it('names the block and its position, not its internal type id', () => {
    openInspector();
    expect(view.container.textContent).not.toMatch(/logoCloud/i);
    expect(view.container.textContent).toContain('Bloque 2 de 2');
  });

  it('style groups are in the interface language', () => {
    expect(styleGroups.map((g) => translateStyleGroupLabel(g.key, 'es'))).toEqual([
      'Color de fondo', 'Relleno', 'Margen', 'Esquinas redondeadas',
    ]);
    expect(styleGroups.map((g) => translateStyleGroupLabel(g.key, 'en'))).toEqual([
      'Background color', 'Padding', 'Margin', 'Corner radius',
    ]);
  });

  it('below xl the inspector opens over the canvas and can be closed, which ends the selection', () => {
    openInspector();
    const aside = view.container.querySelector('aside')!;
    expect(aside.className).toContain('max-xl:absolute');
    click(view.container.querySelector('[aria-label="Cerrar el inspector"]')!);
    expect(useEditorStore.getState().selectedBlockId).toBeNull();
    // With nothing selected it is not drawn over the canvas at all
    expect(view.container.querySelector('aside')!.className).toContain('max-xl:hidden');
  });
});

describe('background colour from the theme (QA-082)', () => {
  it('an empty colour shows "from the theme" with the colour the theme paints, not a made-up white', () => {
    view = render(<ColorField id="c" labelId="c-label" value="" inheritedColor="#0f172a" onChange={vi.fn()} />);
    const trigger = view.container.querySelector('#c')!;
    expect(trigger.textContent).toContain('Del tema');
    expect(trigger.textContent).toContain('#0F172A');
    expect(trigger.textContent).not.toContain('#ffffff');
  });

  it('opening and leaving the palette untouched keeps the colour inherited', () => {
    const onChange = vi.fn();
    view = render(<ColorField id="c" value="" inheritedColor="#0F172A" onChange={onChange} />);
    click(view.container.querySelector('#c')!);
    const hex = view.container.querySelector<HTMLInputElement>('input[type="text"]')!;
    act(() => {
      hex.focus();
      hex.blur();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reads the painted background of the block from the canvas', () => {
    const root = document.createElement('div');
    root.id = 'block-focus-b1';
    root.innerHTML = '<div data-block-toolbar style="background-color: rgb(37, 99, 235)"></div><div data-block-content><div><section style="background-color: rgb(15, 23, 42)"></section></div></div>';
    document.body.appendChild(root);
    view = render(<span />);
    expect(readBlockBackground('b1')).toBe('#0F172A');
    expect(readBlockBackground('missing')).toBeNull();
  });
});

describe('one hex format (QA-114)', () => {
  it('shows and writes colours as #RRGGBB in capitals', () => {
    const onChange = vi.fn();
    view = render(<ColorField id="c" value="#2563eb" onChange={onChange} />);
    expect(view.container.querySelector('#c')!.textContent).toContain('#2563EB');
    click(view.container.querySelector('#c')!);
    click(view.container.querySelector('[aria-label="Color #FFFFFF"]')!);
    expect(onChange).toHaveBeenCalledWith('#FFFFFF');
  });
});
