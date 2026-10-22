import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ShareModal from '@/components/editor/ShareModal';
import { api } from '@/lib/api';
import { render, resetEditorStore } from '../mobile-editor/test-utils';

/**
 * UX-001: the top bar has backdrop-filter, which makes it the containing block of
 * `position: fixed`. A dialog declared inside it was drawn inside the 56 px header
 * and cut off above the screen, so dialogs must live in the body.
 */
describe('dialogs declared inside the top bar (UX-001)', () => {
  it('ConfirmDialog is rendered in the body, not inside its parent', () => {
    const view = render(
      <header data-testid="bar">
        <ConfirmDialog open title="Despublicar" message="Seguro" onConfirm={() => undefined} onCancel={() => undefined} />
      </header>,
    );
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.closest('header')).toBeNull();
    expect(view.container.contains(dialog)).toBe(false);
    view.unmount();
  });

  it('ShareModal is rendered in the body, not inside its parent', async () => {
    resetEditorStore();
    vi.spyOn(api.pages, 'collaborators').mockResolvedValue({
      owner: { id: 'u1', username: 'ana', email: 'ana@example.com' },
      collaborators: [],
    });
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(<header><ShareModal pageId="11111111-1111-4111-8111-111111111111" onClose={() => undefined} /></header>);
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(view.container.contains(dialog)).toBe(false);
    view.unmount();
    vi.restoreAllMocks();
  });
});
