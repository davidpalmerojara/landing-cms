/**
 * QA-066: the phone's back button closes the open Quick Edit sheet instead of
 * leaving the editor. In its own file: `useCloseOnBack` keeps module state and
 * shares the window history, so sheets closed by other tests would hand back
 * their history entry in the middle of these ones.
 */
import { act } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MobileEditor from '@/components/mobile-editor/MobileEditor';
import { useEditorStore } from '@/store/editor-store';
import { click, makeBlock, makePage, render, resetEditorStore, setNavigatorOnline, type RenderResult } from './test-utils';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

function renderEditor(): RenderResult {
  return render(
    <MobileEditor
      pageId="page-123"
      onSave={vi.fn().mockResolvedValue(true)}
      onPublish={vi.fn().mockResolvedValue(true)}
      onUnpublish={vi.fn().mockResolvedValue(true)}
    />,
  );
}

/** Opens a block's sheet by tapping its card. */
function openCard(view: RenderResult, title: string) {
  const label = [...view.container.querySelectorAll('[role="listitem"] p')].find((p) => p.textContent === title) as HTMLElement;
  click(label);
}

const dialog = () => document.querySelector('[role="dialog"]');
const onSheetEntry = () => Boolean((window.history.state as { paxlSheet?: boolean } | null)?.paxlSheet);

describe('Quick Edit, QA-066 back button', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetEditorStore(makePage([makeBlock('hero', { title: 'Hola' }, { id: 'b-hero' })]));
    setNavigatorOnline(true);
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });

  afterEach(async () => {
    // Let a closed sheet give its history entry back before the next test
    await act(async () => {
      await vi.waitFor(() => expect(onSheetEntry()).toBe(false), { timeout: 3000 });
    });
    vi.restoreAllMocks();
    useEditorStore.setState(useEditorStore.getInitialState(), true);
  });

  it('closes the open sheet and stays on the page', async () => {
    const view = renderEditor();
    const url = window.location.href;

    openCard(view, 'Hero');
    expect(dialog()).not.toBeNull();
    // A history entry of its own, at the same address
    expect(window.history.state).toMatchObject({ paxlSheet: true });
    expect(window.location.href).toBe(url);

    await act(async () => {
      window.history.back();
      await vi.waitFor(() => expect(dialog()).toBeNull(), { timeout: 3000 });
    });
    expect(window.location.href).toBe(url);
    view.unmount();
  });

  it('closing the sheet another way gives its history entry back', async () => {
    const view = renderEditor();
    openCard(view, 'Hero');
    expect(onSheetEntry()).toBe(true);

    view.unmount();
    await act(async () => {
      await vi.waitFor(() => expect(onSheetEntry()).toBe(false), { timeout: 3000 });
    });
  });
});
