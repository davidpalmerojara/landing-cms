import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MobileEditor from '@/components/mobile-editor/MobileEditor';
import { useEditorStore } from '@/store/editor-store';
import { makeBlock, makePage, render, resetEditorStore, click, setNavigatorOnline } from './test-utils';

describe('MobileEditor', () => {
  beforeEach(() => {
    resetEditorStore();
    setNavigatorOnline(true);
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    useEditorStore.setState(useEditorStore.getInitialState(), true);
  });

  it('renders the block list when the store has blocks', () => {
    const blocks = [
      makeBlock('hero', { title: 'Hero title', subtitle: 'Hero subtitle' }),
      makeBlock('faq', { title: 'Questions' }),
    ];
    resetEditorStore(makePage(blocks));

    const view = render(
      <MobileEditor
        pageId="page-123"
        onSave={vi.fn().mockResolvedValue(true)}
        onPublish={vi.fn().mockResolvedValue(true)}
      />,
    );

    const items = view.container.querySelectorAll('[role="listitem"]');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Hero');
    expect(items[0].textContent).toContain('Hero title');
    expect(items[1].textContent).toContain('Preguntas frecuentes');
    expect(items[1].textContent).toContain('Questions');

    view.unmount();
  });

  it('shows an empty state when there are no blocks', () => {
    resetEditorStore(makePage([]));

    const view = render(
      <MobileEditor
        pageId="page-123"
        onSave={vi.fn().mockResolvedValue(true)}
        onPublish={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(view.container.textContent).toContain('Tu página está vacía');
    expect(view.container.querySelector('[role="list"]')).toBeNull();

    view.unmount();
  });

  it('shows the quick actions in the toolbar', () => {
    resetEditorStore(makePage([makeBlock('hero', { title: 'Toolbar block' })]));

    const view = render(
      <MobileEditor
        pageId="page-123"
        onSave={vi.fn().mockResolvedValue(true)}
        onPublish={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(view.container.querySelector('[aria-label="Volver al dashboard"]')).toBeInTheDocument();
    expect(view.container.querySelector('[aria-label="Vista previa"]')).toBeInTheDocument();
    expect(view.container.querySelector('[aria-label="Publicar página"]')).toBeInTheDocument();
    expect(view.container.querySelector('[aria-label="Añadir bloque"]')).toBeInTheDocument();

    view.unmount();
  });

  it('shows autosave feedback for saving, saved and offline states', () => {
    const page = makePage([makeBlock('hero', { title: 'Autosave block' })]);
    resetEditorStore(page);

    useEditorStore.setState({ autoSaveStatus: 'saving' });
    let view = render(
      <MobileEditor
        pageId="page-123"
        onSave={vi.fn().mockResolvedValue(true)}
        onPublish={vi.fn().mockResolvedValue(true)}
      />,
    );
    expect(view.container.querySelector('[aria-label="Guardando..."]')).toBeInTheDocument();
    view.unmount();

    resetEditorStore(page);
    useEditorStore.setState({ autoSaveStatus: 'saved' });
    view = render(
      <MobileEditor
        pageId="page-123"
        onSave={vi.fn().mockResolvedValue(true)}
        onPublish={vi.fn().mockResolvedValue(true)}
      />,
    );
    expect(view.container.querySelector('[aria-label="Guardado"]')).toBeInTheDocument();
    view.unmount();

    resetEditorStore(page);
    setNavigatorOnline(false);
    view = render(
      <MobileEditor
        pageId="page-123"
        onSave={vi.fn().mockResolvedValue(true)}
        onPublish={vi.fn().mockResolvedValue(true)}
      />,
    );
    expect(view.container.querySelector('[aria-label="Sin conexión"]')).toBeInTheDocument();
    view.unmount();
  });

  it('adds a block from the FAB through the store action', () => {
    vi.useFakeTimers();
    resetEditorStore(makePage([]));

    const view = render(
      <MobileEditor
        pageId="page-123"
        onSave={vi.fn().mockResolvedValue(true)}
        onPublish={vi.fn().mockResolvedValue(true)}
      />,
    );

    click(view.container.querySelector('[aria-label="Añadir bloque"]') as HTMLElement);
    click([...view.container.querySelectorAll('button')].find((btn) => btn.textContent?.includes('Hero')) as HTMLElement);

    vi.runOnlyPendingTimers();

    expect(useEditorStore.getState().page.blocks).toHaveLength(1);
    expect(useEditorStore.getState().page.blocks[0].type).toBe('hero');

    view.unmount();
  });

  it('updates block order in the store when reordering', () => {
    const blocks = [
      makeBlock('hero', { title: 'First' }, { id: 'b1', name: 'Hero' }),
      makeBlock('features', { title: 'Second' }, { id: 'b2', name: 'Features' }),
      makeBlock('cta', { title: 'Third' }, { id: 'b3', name: 'CTA' }),
    ];
    resetEditorStore(makePage(blocks));

    useEditorStore.getState().reorderBlocks(0, 2);

    expect(useEditorStore.getState().page.blocks.map((block) => block.id)).toEqual(['b2', 'b1', 'b3']);
  });
});
