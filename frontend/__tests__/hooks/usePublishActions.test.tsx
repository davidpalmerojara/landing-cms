import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useEffect } from 'react';
import { usePublishActions } from '@/hooks/usePublishActions';
import { useEditorStore } from '@/store/editor-store';
import { makeBlock, makePage, render, resetEditorStore, type RenderResult } from '../mobile-editor/test-utils';

type Actions = ReturnType<typeof usePublishActions>;
let actions: Actions;
let view: RenderResult;

const onPublish = vi.fn(async () => true);
const onUnpublish = vi.fn(async () => true);

function Harness() {
  const result = usePublishActions({ onPublish, onUnpublish, phone: true });
  useEffect(() => {
    actions = result;
  });
  return null;
}

const messages = () => useEditorStore.getState().toasts.map((toast) => toast.message);

describe('usePublishActions toasts', () => {
  beforeEach(() => {
    // A button without a link: publishing says so (D9)
    resetEditorStore(makePage([makeBlock('hero', { buttonText: 'Empezar', buttonLink: '' })]));
    onPublish.mockClear();
    onUnpublish.mockClear();
    view = render(<Harness />);
  });

  afterEach(() => {
    view.unmount();
  });

  it('EDITOR3-003: unpublishing takes down the "published" notice instead of stacking next to it', async () => {
    await act(async () => { await actions.publish(); });
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toContain('Página publicada');

    await act(async () => { await actions.unpublish(); });

    expect(messages()).toEqual(['Página despublicada']);
  });

  it('EDITOR3-003: publishing again replaces the previous publication message', async () => {
    await act(async () => { await actions.publish(); });
    await act(async () => { await actions.publish(); });

    expect(messages()).toHaveLength(1);
  });

  it('other toasts are left alone', async () => {
    useEditorStore.getState().addToast('Algo no relacionado', 'info');

    await act(async () => { await actions.publish(); });
    await act(async () => { await actions.unpublish(); });

    expect(messages()).toEqual(['Algo no relacionado', 'Página despublicada']);
  });
});
