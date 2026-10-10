import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import AIBlockEditPopover from '@/components/editor/AIBlockEditPopover';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { api } from '@/lib/api';
import type { AiEditBlockResponse } from '@/lib/api';
import { isMacPlatform } from '@/lib/keyboard';
import { registerSaveFlush } from '@/lib/save-flush';
import { useEditorStore } from '@/store/editor-store';
import { buttonByText, typeInto } from '../guest/test-helpers';
import { click, makeBlock, makePage, render, resetEditorStore } from '../mobile-editor/test-utils';
import type { RenderResult } from '../mobile-editor/test-utils';

const RESPONSE: AiEditBlockResponse = {
  block: { id: 'b1', type: 'hero', order: 0, data: { title: 'Editado' }, styles: {} },
  source: 'live',
  provider: null,
  tokens: { input: 0, output: 0, cost_estimate: '0' },
} as AiEditBlockResponse;

describe('AIBlockEditPopover', () => {
  let view: RenderResult;

  async function open() {
    vi.spyOn(api.ai, 'options').mockResolvedValue({ mode: 'live', live_user_daily_limit: 2, prompts: [] });
    view = render(<AIBlockEditPopover blockId="b1" pageId="page-123" onClose={() => undefined} />);
    await act(async () => {});
  }

  const send = async (instruction: string) => {
    typeInto(view.container.querySelector<HTMLInputElement>('input[type="text"]')!, instruction);
    await act(async () => { click(view.container.querySelector('button[aria-label="Enviar instrucción"]')!); });
  };

  beforeEach(() => {
    resetEditorStore(makePage([makeBlock('hero', { title: 'Antes' }, { id: 'b1' })]));
  });

  afterEach(() => {
    view.unmount();
    vi.restoreAllMocks();
  });

  it('QA-037: saves what is on screen before the server edits its copy', async () => {
    await open();
    const order: string[] = [];
    const unregister = registerSaveFlush(async () => { order.push('flush'); return true; });
    vi.spyOn(api.ai, 'editBlock').mockImplementation(async () => { order.push('edit'); return RESPONSE; });

    await send('Más corto');

    expect(order).toEqual(['flush', 'edit']);
    unregister();
  });

  it('QA-037: does not edit an old copy when the save failed, and says why', async () => {
    await open();
    const unregister = registerSaveFlush(async () => false);
    const editBlock = vi.spyOn(api.ai, 'editBlock');

    await send('Más corto');

    expect(editBlock).not.toHaveBeenCalled();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('tus últimos cambios no se han podido guardar');
    unregister();
  });

  it('QA-038: focusing the instruction does not scroll the editor, and the popover undoes the canvas zoom', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    act(() => { useEditorStore.setState({ viewportState: { zoom: 0.5, x: 0, y: 0 } }); });
    await open();

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    const popover = view.container.firstElementChild as HTMLElement;
    expect(popover.style.scale).toBe('2');
  });
});

describe('ConfirmDialog (QA-045)', () => {
  it('its default buttons follow the interface language', () => {
    const view = render(
      <ConfirmDialog open title="Delete block" message="Delete?" onConfirm={() => undefined} onCancel={() => undefined} />,
      'en',
    );
    expect(buttonByText(view.container, 'Cancel')).toBeTruthy();
    expect(buttonByText(view.container, 'Delete')).toBeTruthy();
    view.unmount();
  });

  it('shortcut hints say Cmd on Apple keyboards', () => {
    const platform = vi.spyOn(navigator, 'platform', 'get');
    platform.mockReturnValue('MacIntel');
    expect(isMacPlatform()).toBe(true);
    platform.mockReturnValue('Win32');
    expect(isMacPlatform()).toBe(false);
    platform.mockRestore();
  });
});
