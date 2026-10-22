/** MOBILE-010: the phone publish sheet shows the full address and can copy or share it. */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MobilePublishSheet from '@/components/mobile-editor/MobilePublishSheet';
import { useEditorStore } from '@/store/editor-store';
import { click, makeBlock, makePage, render, resetEditorStore } from './test-utils';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

function openSheet(status: 'draft' | 'published') {
  resetEditorStore(makePage([makeBlock('hero', { title: 'Hola' })], { slug: 'mi-landing', name: 'Mi landing' }));
  useEditorStore.setState((s) => ({ page: { ...s.page, status, hasUnpublishedChanges: false, isOwner: true } }));
  return render(
    <MobilePublishSheet open onClose={() => undefined} onPublish={vi.fn().mockResolvedValue(true)} onUnpublish={vi.fn()} />,
  );
}

const button = (text: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
const toasts = () => useEditorStore.getState().toasts.map((t) => t.message);

describe('publish sheet link (MOBILE-010)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the absolute address and copies it, saying so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText }, share: undefined });
    const view = openSheet('published');

    expect(document.body.querySelector('[data-testid="public-url"]')?.textContent)
      .toBe(`${window.location.origin}/p/mi-landing`);
    expect(button('Compartir')).toBeUndefined();

    await act(async () => { click(button('Copiar enlace')!); });

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/mi-landing`);
    expect(toasts()).toContain('Enlace copiado');
    view.unmount();
  });

  it('says so when the clipboard is blocked, instead of failing silently', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const view = openSheet('published');

    await act(async () => { click(button('Copiar enlace')!); });

    expect(toasts().some((m) => m.includes('No se ha podido copiar'))).toBe(true);
    view.unmount();
  });

  it('offers the system share sheet when the browser has one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn() }, share });
    const view = openSheet('published');

    await act(async () => { click(button('Compartir')!); });

    expect(share).toHaveBeenCalledWith({ title: 'Mi landing', url: `${window.location.origin}/p/mi-landing` });
    view.unmount();
  });

  it('a draft has no link to copy yet', () => {
    const view = openSheet('draft');
    expect(button('Copiar enlace')).toBeUndefined();
    view.unmount();
  });
});
