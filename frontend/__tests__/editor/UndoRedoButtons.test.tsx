import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import TopBar from '@/components/editor/TopBar';
import FloatingViewportControls from '@/components/editor/FloatingViewportControls';
import { COLLAB_COLORS, useEditorStore } from '@/store/editor-store';
import { contrastRatio } from '@/lib/design-tokens';
import { CANVAS_SHORTCUT_KEYS } from '@/lib/keyboard';
import { MESSAGES } from '@/lib/i18n';
import { click, makeBlock, makePage, render, resetEditorStore } from '../mobile-editor/test-utils';
import type { RenderResult } from '../mobile-editor/test-utils';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/ui/LocaleSwitcher', () => ({ default: () => null }));
vi.mock('@/components/ui/ThemeToggle', () => ({ default: () => null }));

const HERO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function renderBar(view: 'design' | 'styles' = 'design'): RenderResult {
  return render(
    <TopBar
      onSave={vi.fn().mockResolvedValue(true)}
      onPublish={vi.fn().mockResolvedValue(true)}
      onViewChange={() => undefined}
      activeView={view}
    />,
  );
}

const undoButton = (view: RenderResult) => view.container.querySelector<HTMLButtonElement>('button[aria-label^="Deshacer"]');
const redoButton = (view: RenderResult) => view.container.querySelector<HTMLButtonElement>('button[aria-label^="Rehacer"]');

describe('undo and redo buttons on desktop (UX-004)', () => {
  let view: RenderResult;

  beforeEach(() => {
    resetEditorStore(makePage([makeBlock('hero', { title: 'Hola' }, { id: HERO })]));
  });

  afterEach(() => view?.unmount());

  it('both start disabled, name their shortcut, and follow the history', () => {
    view = renderBar();
    expect(undoButton(view)?.disabled).toBe(true);
    expect(redoButton(view)?.disabled).toBe(true);
    expect(undoButton(view)?.title).toMatch(/\((Ctrl\+|⌘)Z\)$/);

    act(() => { useEditorStore.getState().updateBlock(HERO, 'title', 'Adiós'); });
    expect(undoButton(view)?.disabled).toBe(false);
    expect(redoButton(view)?.disabled).toBe(true);

    click(undoButton(view)!);
    expect(useEditorStore.getState().page.blocks[0].data).toMatchObject({ title: 'Hola' });
    expect(undoButton(view)?.disabled).toBe(true);
    expect(redoButton(view)?.disabled).toBe(false);

    click(redoButton(view)!);
    expect(useEditorStore.getState().page.blocks[0].data).toMatchObject({ title: 'Adiós' });
  });

  it('only the design view has them', () => {
    view = renderBar('styles');
    expect(undoButton(view)).toBeNull();
  });

  it('the shortcut list in the inspector names undo and cancelling an inline edit, in both languages', () => {
    expect(CANVAS_SHORTCUT_KEYS).toContain('shortcutUndo');
    expect(CANVAS_SHORTCUT_KEYS).toContain('shortcutCancelEdit');
    for (const locale of ['es', 'en'] as const) {
      expect(MESSAGES[locale].a11y.shortcutUndo).toBeTruthy();
      expect(MESSAGES[locale].a11y.shortcutCancelEdit).toBeTruthy();
    }
  });
});

describe('contrast of editor chips (UX-006)', () => {
  it('every collaboration colour carries white text at 4.5:1 or more', () => {
    for (const { hex } of COLLAB_COLORS) {
      expect(contrastRatio('#ffffff', hex), hex).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the zoom percentage uses the primary text colour, not the dimmer secondary one', () => {
    const view = render(<FloatingViewportControls onCenterCanvas={() => undefined} onZoomStep={() => undefined} />);
    const label = [...view.container.querySelectorAll('span')].find((el) => el.textContent?.endsWith('%'));
    expect(label?.className).toContain('text-primary');
    expect(label?.className).not.toContain('text-secondary');
    view.unmount();
  });
});
