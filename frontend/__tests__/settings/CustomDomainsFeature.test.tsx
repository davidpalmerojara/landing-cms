import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import SettingsPage from '@/app/settings/page';
import DomainsSettingsPage from '@/app/settings/domains/page';
import { api } from '@/lib/api';
import { render, type RenderResult } from '../mobile-editor/test-utils';
import { guestUser, normalUser } from '../guest/test-helpers';

const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  notFound,
}));

// The language switcher needs the app's locale provider, which these tests don't mount
vi.mock('@/components/ui/LocaleSwitcher', () => ({ default: () => null }));

let view: RenderResult;

async function mount(ui: React.ReactElement) {
  await act(async () => {
    view = render(ui);
  });
  await act(async () => {});
}

const text = () => view.container.textContent ?? '';

function serverOffers(customDomains: boolean | 'unreachable') {
  vi.spyOn(api.features, 'get').mockImplementation(() => (
    customDomains === 'unreachable' ? Promise.reject(new Error('offline')) : Promise.resolve({ custom_domains: customDomains, billing: false })
  ));
}

beforeEach(() => {
  notFound.mockClear();
  vi.spyOn(api.auth, 'me').mockResolvedValue(normalUser);
});

afterEach(() => {
  view.unmount();
  vi.restoreAllMocks();
});

describe('settings hub', () => {
  it('lists custom domains when the deployment has them', async () => {
    serverOffers(true);
    await mount(<SettingsPage />);

    expect(text()).toContain('Dominios personalizados');
  });

  it('hides custom domains when it does not', async () => {
    serverOffers(false);
    await mount(<SettingsPage />);

    expect(text()).not.toContain('Dominios personalizados');
    expect(text()).toContain('Eliminar cuenta');
  });

  it('hides them while the answer is unknown or the request fails', async () => {
    serverOffers('unreachable');
    await mount(<SettingsPage />);

    expect(text()).not.toContain('Dominios personalizados');
  });

  it('keeps the explanation for guests only where the feature exists', async () => {
    vi.spyOn(api.auth, 'me').mockResolvedValue(guestUser);
    serverOffers(true);
    await mount(<SettingsPage />);
    expect(text()).toContain('Necesita una cuenta');
    view.unmount();

    serverOffers(false);
    await mount(<SettingsPage />);
    expect(text()).not.toContain('Necesita una cuenta');
  });

  it('offers account deletion to people with an account, not to guests', async () => {
    serverOffers(false);
    await mount(<SettingsPage />);
    expect(text()).toContain('Zona de peligro');
    view.unmount();

    vi.spyOn(api.auth, 'me').mockResolvedValue(guestUser);
    await mount(<SettingsPage />);
    expect(text()).not.toContain('Zona de peligro');
  });
});

describe('domains page', () => {
  it('does not exist where custom domains are off, and asks the server for nothing else', async () => {
    serverOffers(false);
    const list = vi.spyOn(api.domains, 'list');

    await expect(mount(<DomainsSettingsPage />)).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFound).toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('loads normally where they are on', async () => {
    serverOffers(true);
    vi.spyOn(api.domains, 'list').mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    vi.spyOn(api.pages, 'list').mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    vi.spyOn(api.billing, 'subscription').mockResolvedValue({ subscription: null });

    await mount(<DomainsSettingsPage />);

    expect(notFound).not.toHaveBeenCalled();
    expect(text()).toContain('Dominios');
  });
});

