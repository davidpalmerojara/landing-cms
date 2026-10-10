import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import BlockWrapper from '@/components/editor/BlockWrapper';
import LeftSidebar from '@/components/editor/LeftSidebar';
import CanvasViewport from '@/components/editor/CanvasViewport';
import HeroBlock from '@/components/blocks/HeroBlock';
import TemplatePickerModal from '@/components/dashboard/TemplatePickerModal';
import BlockFields from '@/components/inspector/BlockFields';
import { useEditorStore } from '@/store/editor-store';
import { getBlockDefaults } from '@/lib/block-defaults';
import { blockRegistry } from '@/lib/block-registry';
import { normalizeBlockData } from '@/lib/block-data';
import { MESSAGES, type AppLocale } from '@/lib/i18n';
import { click, makeBlock, makePage, render, resetEditorStore, type RenderResult } from '../mobile-editor/test-utils';
import { SPANISH_MARKERS } from '../lib/content-helpers';

let view: RenderResult | null = null;

function mount(ui: React.ReactElement, locale: AppLocale): RenderResult {
  view = render(ui, locale);
  return view;
}

afterEach(() => {
  vi.unstubAllGlobals();
  view?.unmount();
  view = null;
  vi.restoreAllMocks();
});

describe('block name on the canvas toolbar', () => {
  const block = makeBlock('hero', { title: 'T' }, { id: 'b1', name: 'Hero Section' });

  beforeEach(() => resetEditorStore(makePage([block])));

  it('is translated to Spanish by block type, not the English name stored in the block', () => {
    const { container } = mount(<BlockWrapper block={block} index={0}><div /></BlockWrapper>, 'es');
    expect(container.querySelector('[role="region"]')?.getAttribute('aria-label')).toBe(MESSAGES.es.blocks.hero);
    expect(container.textContent).toContain(MESSAGES.es.blocks.hero);
    expect(container.textContent).not.toContain('Hero Section');
  });

  it('is translated to English too', () => {
    const features = makeBlock('features', {}, { id: 'b2', name: 'Features Grid' });
    resetEditorStore(makePage([features]));
    const { container } = mount(<BlockWrapper block={features} index={0}><div /></BlockWrapper>, 'en');
    expect(container.querySelector('[role="region"]')?.getAttribute('aria-label')).toBe('Features');
    expect(container.textContent).toContain('Features');
    expect(container.textContent).not.toContain('Features Grid');
  });

  it('names a dragged block in the interface language', () => {
    const initDrag = vi.fn();
    useEditorStore.setState({ initDrag });
    const { container } = mount(<BlockWrapper block={block} index={0}><div /></BlockWrapper>, 'es');
    act(() => {
      container.querySelector('.cursor-grab')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    });
    expect(initDrag).toHaveBeenCalledWith(expect.objectContaining({ label: MESSAGES.es.blocks.hero }), expect.anything());
  });
});

describe('layers panel', () => {
  it('lists blocks with translated names whatever name they hold', () => {
    resetEditorStore(makePage([makeBlock('cta', {}, { name: 'Call to Action' }), makeBlock('faq', {}, { name: 'FAQ' })]));
    useEditorStore.setState({ leftTab: 'layers' });
    const { container } = mount(<LeftSidebar />, 'es');
    const names = Array.from(container.querySelectorAll('[data-layer-item]')).map((el) => el.textContent);
    expect(names).toEqual([MESSAGES.es.blocks.cta, MESSAGES.es.blocks.faq]);
  });
});

describe('adding blocks creates content in the interface language', () => {
  beforeEach(() => {
    resetEditorStore(makePage([]));
    useEditorStore.setState({ leftTab: 'components' });
  });

  it('from the sidebar, in English', () => {
    const { container } = mount(<LeftSidebar />, 'en');
    click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Hero')!);
    const [added] = useEditorStore.getState().page.blocks;
    expect(added.type).toBe('hero');
    expect(added.type === 'hero' && added.data).toEqual(getBlockDefaults('hero', 'en'));
  });

  it('from the sidebar, in Spanish, with the text it always had', () => {
    const { container } = mount(<LeftSidebar />, 'es');
    click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Hero')!);
    const [added] = useEditorStore.getState().page.blocks;
    expect(added.type === 'hero' && added.data.title).toBe('Tu Nueva Sección');
  });

  it('from the empty canvas shortcuts', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    const { container } = mount(<CanvasViewport />, 'en');
    click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Call to action')!);
    const [added] = useEditorStore.getState().page.blocks;
    expect(added.type === 'cta' && added.data.title).toBe('Start your journey');
  });

  it('an added list item (inspector) is in the interface language', () => {
    const faq = makeBlock('faq', { title: 'FAQ', questions: [] }, { id: 'faq1' });
    resetEditorStore(makePage([faq]));
    const fields = blockRegistry.faq.fields;
    const { container } = mount(
      <BlockFields block={faq} fields={fields} idPrefix="t" renderScalar={() => null} />,
      'en',
    );
    click(Array.from(container.querySelectorAll('button')).find((b) => /add/i.test(b.textContent ?? ''))!);
    const [updated] = useEditorStore.getState().page.blocks;
    expect(updated.type === 'faq' && updated.data.questions).toEqual([
      { question: 'New question', answer: 'Write the answer here.' },
    ]);
  });
});

describe('template picker', () => {
  const props = { open: true, onClose: () => undefined, onSelect: () => undefined, onAIGenerate: () => undefined, isCreating: false };

  it('shows the templates in English', () => {
    const { container } = mount(<TemplatePickerModal {...props} />, 'en');
    const text = container.textContent ?? '';
    expect(text).toContain('Restaurant');
    expect(text).toContain('Landing page for a grill restaurant');
    expect(text).toContain('Food & drink');
    expect(text).not.toContain('Gastronomía');
    expect(text).not.toMatch(/Página de producto SaaS/);
  });

  it('shows the templates in Spanish', () => {
    const { container } = mount(<TemplatePickerModal {...props} />, 'es');
    const text = container.textContent ?? '';
    expect(text).toContain('Restaurante');
    expect(text).toContain('Gastronomía');
    expect(text).toContain('Página de producto SaaS');
  });

  it('shows no Spanish template text in the English UI', () => {
    const { container } = mount(<TemplatePickerModal {...props} />, 'en');
    const cards = Array.from(container.querySelectorAll('button[aria-pressed]')).slice(1); // skip the blank page
    expect(cards).toHaveLength(4);
    for (const card of cards) expect(card.textContent).not.toMatch(SPANISH_MARKERS);
  });
});

describe('hero badge', () => {
  const heroData = (badgeText: string) => normalizeBlockData('hero', { ...getBlockDefaults('hero', 'es'), badgeText });

  beforeEach(() => resetEditorStore());

  it('shows nothing when the badge text is empty', () => {
    const { container } = mount(<HeroBlock blockId="h" isPreviewMode data={heroData('')} />, 'es');
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).not.toContain('Nuevo Editor UI');
  });

  it('shows nothing for a badge of only spaces', () => {
    const { container } = mount(<HeroBlock blockId="h" isPreviewMode data={heroData('   ')} />, 'es');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('shows the text when there is one', () => {
    const { container } = mount(<HeroBlock blockId="h" isPreviewMode data={heroData('Nuevo')} />, 'es');
    expect(container.textContent).toContain('Nuevo');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('does not bring the default text back for old data without the field', () => {
    const { container } = mount(<HeroBlock blockId="h" isPreviewMode data={normalizeBlockData('hero', { title: 'Hola' })} />, 'es');
    expect(container.textContent).not.toContain('Nuevo Editor UI');
    expect(container.querySelector('svg')).toBeNull();
  });
});
