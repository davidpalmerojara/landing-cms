import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import BlockFields from '@/components/inspector/BlockFields';
import FieldRenderer from '@/components/inspector/FieldRenderer';
import { useEditorStore } from '@/store/editor-store';
import { getBlockFields } from '@/lib/block-registry';
import { translateFieldDefinition } from '@/lib/editor-i18n';
import { typeInto } from '../guest/test-helpers';
import { makeBlock, makePage, render, resetEditorStore } from '../mobile-editor/test-utils';
import type { RenderResult } from '../mobile-editor/test-utils';

const HERO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** The inspector's content fields for the hero, as Inspector renders them. */
function HeroFields() {
  const block = useEditorStore((s) => s.page.blocks.find((b) => b.id === HERO));
  if (!block) return null;
  return (
    <BlockFields
      block={block}
      fields={getBlockFields('hero').map((f) => translateFieldDefinition(f, 'es'))}
      idPrefix="field"
      renderScalar={(field, value, onChange, inputId) => (
        <FieldRenderer field={field} value={value} onChange={onChange} id={inputId} />
      )}
    />
  );
}

const heroData = () => useEditorStore.getState().page.blocks[0].data as unknown as Record<string, string>;
const input = (view: RenderResult, id: string) => view.container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!;

/** Types into an input or a textarea the way React notices. */
function typeIn(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  if (element instanceof HTMLInputElement) return typeInto(element, value);
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function blur(element: HTMLElement) {
  act(() => { element.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
}

describe('inspector fields follow the server rules (QA-004)', () => {
  let view: RenderResult;

  beforeEach(() => {
    resetEditorStore(makePage([makeBlock('hero', { title: 'Hola', subtitle: 'Sub' }, { id: HERO })], { id: 'server-page' }));
    view = render(<HeroFields />);
  });

  afterEach(() => view.unmount());

  it('inputs stop at the server limit; long fields show a counter', () => {
    expect(input(view, 'field-title').maxLength).toBe(200);
    expect(input(view, 'field-buttonText').maxLength).toBe(50);
    const subtitle = view.container.querySelector<HTMLTextAreaElement>('#field-subtitle')!;
    expect(subtitle.maxLength).toBe(500);
    expect(document.getElementById('field-subtitle-counter')?.textContent).toBe('3/500 caracteres');
    expect(subtitle.getAttribute('aria-describedby')).toBe('field-subtitle-counter');
  });

  it('a link typed without its scheme is completed when leaving the field', () => {
    const link = input(view, 'field-buttonLink');
    typeIn(link, 'example.com');
    blur(link);

    expect(heroData().buttonLink).toBe('https://example.com');
    expect(link.getAttribute('aria-invalid')).toBeNull();
  });

  it('a link the server would refuse is flagged on the field', () => {
    const link = input(view, 'field-buttonLink');
    typeIn(link, 'javascript:alert(1)');
    blur(link);

    expect(link.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('field-buttonLink-error')?.textContent).toContain('Enlace no válido');
  });

  it('a value the server refused shows its rule on that field until it changes', () => {
    act(() => {
      useEditorStore.getState().updateBlock(HERO, 'title', 'Too long for the server');
      useEditorStore.setState({
        autoSaveStatus: 'error',
        saveIssue: {
          kind: 'rejected',
          fields: [{ blockId: HERO, blockType: 'hero', path: ['title'], value: 'Too long for the server', message: 'Máximo 200 caracteres.' }],
        },
      });
    });
    const title = input(view, 'field-title');
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(title.getAttribute('aria-describedby')).toContain('field-title-error');
    expect(document.getElementById('field-title-error')?.textContent).toBe('Máximo 200 caracteres.');
    // Other fields are not affected
    expect(input(view, 'field-buttonText').getAttribute('aria-invalid')).toBeNull();

    typeIn(title, 'Fixed');
    expect(title.getAttribute('aria-invalid')).toBeNull();
    expect(document.getElementById('field-title-error')).toBeNull();
  });
});
