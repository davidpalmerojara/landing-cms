import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import ImageField from '@/components/inspector/ImageField';
import AssetPickerModal from '@/components/inspector/AssetPickerModal';
import { api } from '@/lib/api';
import type { ApiAsset } from '@/lib/api';
import { render, click, keyDown, type RenderResult } from '../mobile-editor/test-utils';
import { typeInto } from '../guest/test-helpers';

const ASSETS: ApiAsset[] = [
  { id: 'a1', name: 'portada.png', url: '/media/assets/2026/10/portada.png', mime_type: 'image/png', size: 2048, created_at: '2026-10-10T10:00:00Z' },
  { id: 'a2', name: 'equipo.jpg', url: '/media/assets/2026/10/equipo.jpg', mime_type: 'image/jpeg', size: 4096, created_at: '2026-10-10T10:00:00Z' },
];

let view: RenderResult;

const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]');
const buttonNamed = (name: string) => {
  const found = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
    .find((b) => b.getAttribute('aria-label') === name || b.textContent?.trim() === name);
  if (!found) throw new Error(`No button "${name}"`);
  return found;
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.spyOn(api.assets, 'list').mockResolvedValue({ count: ASSETS.length, next: null, previous: null, results: ASSETS });
});

afterEach(() => {
  view.unmount();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('media library dialog', () => {
  it('QA-020: opens over the whole page, not inside the inspector column that has a backdrop filter', async () => {
    view = render(
      <aside className="backdrop-blur-2xl" style={{ backdropFilter: 'blur(40px)' }} data-testid="inspector">
        <ImageField id="field-image" value="" onChange={vi.fn()} />
      </aside>,
    );
    click(view.container.querySelector('#field-image')!);
    await flush();

    const opened = dialog();
    expect(opened).not.toBeNull();
    // Rendered into document.body: no ancestor with a backdrop filter can confine its fixed layout
    expect(view.container.contains(opened)).toBe(false);
    expect(opened!.closest('[data-testid="inspector"]')).toBeNull();
    expect(opened!.parentElement?.parentElement).toBe(document.body);
  });

  it('QA-021: is a named modal dialog that takes focus, keeps Tab inside and gives focus back on Esc', async () => {
    view = render(<ImageField id="field-image" value="" onChange={vi.fn()} />);
    const opener = view.container.querySelector<HTMLButtonElement>('#field-image')!;
    act(() => opener.focus());
    click(opener);
    await flush();

    const opened = dialog()!;
    expect(opened.getAttribute('aria-modal')).toBe('true');
    const titleId = opened.getAttribute('aria-labelledby');
    expect(document.getElementById(titleId!)?.textContent).toBe('Biblioteca de medios');
    expect(opened.contains(document.activeElement)).toBe(true);

    // Tab from the last control comes back to the first
    const focusables = [...opened.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not([tabindex="-1"])')];
    act(() => focusables[focusables.length - 1].focus());
    keyDown(document.activeElement as HTMLElement, 'Tab');
    expect(document.activeElement).toBe(focusables[0]);

    keyDown(document.activeElement as HTMLElement, 'Escape');
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('QA-021: images and the upload zone are buttons; activating an image selects it', async () => {
    const onSelect = vi.fn();
    view = render(<AssetPickerModal onSelect={onSelect} onClose={vi.fn()} />);
    await flush();

    const upload = document.body.querySelector('[data-upload-zone]');
    expect(upload?.tagName).toBe('BUTTON');
    const image = buttonNamed('portada.png, 2 KB');
    expect(image.getAttribute('aria-pressed')).toBe('false');
    click(image);
    expect(image.getAttribute('aria-pressed')).toBe('true');
    click(buttonNamed('Seleccionar'));
    expect(onSelect).toHaveBeenCalledWith(ASSETS[0]);
  });

  it('QA-072: deleting an image asks first, and Cancel keeps it', async () => {
    const remove = vi.spyOn(api.assets, 'delete').mockResolvedValue(undefined);
    view = render(<AssetPickerModal onSelect={vi.fn()} onClose={vi.fn()} />);
    await flush();

    click(buttonNamed('Eliminar portada.png'));
    expect(remove).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('¿Eliminar la imagen?');
    expect(document.body.textContent).toContain('dejarán de mostrarla');

    click(buttonNamed('Cancelar'));
    expect(remove).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('portada.png');

    click(buttonNamed('Eliminar portada.png'));
    const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('[aria-modal="true"] button')]
      .find((b) => b.textContent === 'Eliminar');
    await act(async () => {
      confirm!.click();
      await Promise.resolve();
    });
    expect(remove).toHaveBeenCalledWith('a1');
  });

  it('QA-074: does not advertise SVG, which the server refuses', async () => {
    view = render(<AssetPickerModal onSelect={vi.fn()} onClose={vi.fn()} />);
    await flush();

    expect(document.body.querySelector('[data-upload-zone]')?.textContent).not.toMatch(/svg/i);
    expect(document.body.querySelector('input[type="file"]')?.getAttribute('accept')).not.toMatch(/svg/i);
  });

  it('QA-074: an upload the server refuses is explained in words, not as raw JSON', async () => {
    const { ApiError } = await import('@/lib/api');
    vi.spyOn(api.assets, 'upload').mockRejectedValue(
      new ApiError(400, '{"error":"Error de validación.","code":"BAD_REQUEST"}'),
    );
    view = render(<AssetPickerModal onSelect={vi.fn()} onClose={vi.fn()} />);
    await flush();

    const input = document.body.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['x'], 'foto.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const alert = document.body.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('El servidor no aceptó el archivo');
    expect(alert?.textContent).not.toContain('{');
  });

  it('QA-079: an image can come from a pasted URL, checked before it is used', async () => {
    const onSelectUrl = vi.fn();
    view = render(<AssetPickerModal onSelect={vi.fn()} onClose={vi.fn()} onSelectUrl={onSelectUrl} />);
    await flush();

    click(buttonNamed('Pegar URL'));
    const input = document.body.querySelector<HTMLInputElement>('input[type="url"]')!;
    expect(document.querySelector(`label[for="${input.id}"]`)?.textContent).toBe('URL de la imagen');

    typeInto(input, 'https://x.test/a.png);position:fixed');
    click(buttonNamed('Seleccionar'));
    expect(onSelectUrl).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');

    typeInto(input, 'https://images.example.com/hero.webp');
    click(buttonNamed('Seleccionar'));
    expect(onSelectUrl).toHaveBeenCalledWith('https://images.example.com/hero.webp');
  });

  it('without onSelectUrl (the old signature) offers the library only', async () => {
    view = render(<AssetPickerModal onSelect={vi.fn()} onClose={vi.fn()} />);
    await flush();
    expect([...document.body.querySelectorAll('button')].some((b) => b.textContent?.includes('Pegar URL'))).toBe(false);
  });
});
