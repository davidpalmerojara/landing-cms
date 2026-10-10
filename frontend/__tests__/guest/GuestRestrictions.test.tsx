import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import AssetPickerModal from '@/components/inspector/AssetPickerModal';
import GuestSessionProvider from '@/components/guest/GuestSessionProvider';
import GuestSettingsScreen from '@/components/guest/GuestSettingsScreen';
import { api } from '@/lib/api';
import type { ApiUser } from '@/lib/api';
import { render, click, type RenderResult } from '../mobile-editor/test-utils';
import { buttonByText, guestUser, normalUser } from './test-helpers';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

let view: RenderResult;

async function openAssetPicker(user: ApiUser): Promise<void> {
  vi.spyOn(api.assets, 'list').mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  await act(async () => {
    view = render(
      <GuestSessionProvider user={user} onClaimed={vi.fn()}>
        <AssetPickerModal onSelect={vi.fn()} onClose={vi.fn()} />
      </GuestSessionProvider>,
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn());
});

afterEach(() => {
  view.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('asset picker in a guest session', () => {
  it('explains that uploads need an account instead of showing a dead upload zone', async () => {
    const upload = vi.spyOn(api.assets, 'upload');
    await openAssetPicker(guestUser);

    expect(document.body.textContent).toContain('Subir imágenes necesita una cuenta');
    expect(document.body.textContent).not.toContain('Subir primera imagen');
    expect([...document.body.querySelectorAll('p')].some((p) => p.textContent === 'Arrastra imágenes aquí o haz clic para subir')).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it('offers the way to get an account from there', async () => {
    await openAssetPicker(guestUser);
    click(buttonByText(document.body, 'Crear cuenta y guardarlo'));
    // The picker is a dialog itself (QA-021): the account dialog opens on top of it
    expect(document.body.querySelectorAll('[role="dialog"]').length).toBeGreaterThan(1);
  });

  it('keeps the upload zone for a normal account', async () => {
    await openAssetPicker(normalUser);
    expect(document.body.textContent).not.toContain('Subir imágenes necesita una cuenta');
    expect(document.body.querySelector('input[type="file"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Subir primera imagen');
  });
});

describe('guest settings screen', () => {
  it('says what is unavailable and why, with a way back and a way to unlock it', () => {
    view = render(
      <GuestSettingsScreen
        user={guestUser}
        onClaimed={vi.fn()}
        title="Los dominios propios necesitan una cuenta"
        description="En una sesión de invitado no se pueden conectar dominios."
        backHref="/settings"
      />,
    );

    expect(view.container.querySelector('h2')?.textContent).toBe('Los dominios propios necesitan una cuenta');
    expect(view.container.querySelector('a[aria-label="Volver"]')?.getAttribute('href')).toBe('/settings');
    click(buttonByText(view.container, 'Crear cuenta y guardarlo'));
    expect(view.container.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
