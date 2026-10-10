import { describe, it, expect, afterEach } from 'vitest';
import EditableText, { typedText } from '@/components/blocks/EditableText';
import { BlockRenderProvider } from '@/components/blocks/block-render-context';
import { render } from '../mobile-editor/test-utils';
import type { RenderResult } from '../mobile-editor/test-utils';

describe('EditableText (EDITOR2-001)', () => {
  let view: RenderResult | null = null;

  afterEach(() => {
    view?.unmount();
    view = null;
  });

  it('a text emptied in the browser ("\\n" left by its <br>) is stored empty', () => {
    expect(typedText('\n', false, 200)).toBe('');
    expect(typedText(' \n ', true, null)).toBe('');
  });

  it('a single-line field keeps no line breaks; a multi-line one keeps them but the trailing one', () => {
    expect(typedText('Hola\n', false, null)).toBe('Hola');
    expect(typedText('Uno\nDos', false, null)).toBe('Uno Dos');
    expect(typedText('Uno\nDos\n', true, null)).toBe('Uno\nDos');
    expect(typedText('Hola mundo', false, 4)).toBe('Hola');
  });

  it('a stored "\\n" shows the placeholder on the canvas instead of a 0 px element', () => {
    view = render(
      <BlockRenderProvider value={{ editable: true, blockType: 'hero' }}>
        <EditableText blockId="b1" fieldKey="title" value={'\n'} as="h1" />
      </BlockRenderProvider>,
    );
    const heading = view.container.querySelector('h1')!;
    expect(heading.childNodes).toHaveLength(0);
    expect(heading.getAttribute('data-placeholder')).toBe('Vacío · doble clic para escribir');
    // EDITOR2-014: on touch screens the placeholder says double tap
    expect(heading.getAttribute('data-placeholder-touch')).toBe('Vacío · doble toque para escribir');
    expect(heading.className).toContain('pointer-coarse:empty:before:content-[attr(data-placeholder-touch)]');
  });
});
