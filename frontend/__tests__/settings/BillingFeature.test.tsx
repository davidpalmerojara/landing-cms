import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import BillingPage from '@/app/settings/billing/page';
import SettingsPage from '@/app/settings/page';
import UpgradePrompt from '@/components/billing/UpgradePrompt';
import { ApiError, api } from '@/lib/api';
import type { ApiBillingPlan } from '@/lib/api';
import { buttonByText, normalUser } from '../guest/test-helpers';
import { click, render, type RenderResult } from '../mobile-editor/test-utils';

const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push }),
}));
vi.mock('@/components/ui/LocaleSwitcher', () => ({ default: () => null }));
vi.mock('@/components/providers/AppIntlProvider', () => ({
  useAppLocale: () => ({ locale: 'es', setLocale: vi.fn() }),
}));

let view: RenderResult;

const free: ApiBillingPlan = {
  id: 'p1', name: 'free', display_name: 'Free', price_monthly: '0', price_yearly: null, max_pages: 3,
  max_ai_generations_per_hour: 0, has_analytics: false, has_collaboration: false, has_custom_domain: false,
  has_ab_testing: false, remove_watermark: false, max_version_history: 5,
};
const pro: ApiBillingPlan = {
  ...free, id: 'p2', name: 'pro', display_name: 'Pro', price_monthly: '19', price_yearly: '190', max_pages: -1,
  has_analytics: true, has_collaboration: true, remove_watermark: true, max_version_history: 50,
};

function serverFeatures(billing: boolean) {
  vi.spyOn(api.features, 'get').mockResolvedValue({ custom_domains: false, billing });
}

async function mount(ui: React.ReactElement) {
  await act(async () => {
    view = render(ui);
  });
  await act(async () => {});
}

const text = () => view.container.textContent ?? '';

beforeEach(() => {
  push.mockReset();
  vi.spyOn(api.auth, 'me').mockResolvedValue(normalUser);
  vi.spyOn(api.billing, 'plans').mockResolvedValue([free, pro]);
  vi.spyOn(api.billing, 'payments').mockResolvedValue({ payments: [] });
  vi.spyOn(api.billing, 'subscription').mockResolvedValue({ subscription: null });
});

afterEach(() => {
  view.unmount();
  vi.restoreAllMocks();
});

describe('billing page, payments off (D2, QA-018)', () => {
  beforeEach(() => serverFeatures(false));

  it('says payments are not active in this demo and offers no upgrade', async () => {
    await mount(<BillingPage />);

    expect(view.container.querySelector('[role="note"]')?.textContent).toContain('Los pagos no están activos en esta demo');
    expect(text()).not.toContain('Actualizar a Pro');
    expect(text()).toContain('No disponible en esta demo');
    expect(text()).not.toContain('Gestionar suscripción');
  });

  it('QA-018: it never shows the server\'s raw error text', async () => {
    vi.spyOn(api.billing, 'plans').mockRejectedValue(
      new ApiError(500, '{"error":"STRIPE_SECRET_KEY not configured"}'),
    );

    await mount(<BillingPage />);

    expect(text()).not.toContain('STRIPE_SECRET_KEY');
    expect(text()).not.toContain('API 500');
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('Algo ha fallado en el servidor');
  });
});

describe('billing page, Stripe test key (D2)', () => {
  beforeEach(() => serverFeatures(true));

  it('labels the page as test mode with the test card', async () => {
    await mount(<BillingPage />);

    const note = view.container.querySelector('[role="note"]');
    expect(note?.textContent).toContain('Modo de prueba');
    expect(note?.textContent).toContain('4242 4242 4242 4242');
  });

  it('offers the upgrade, and the per-month price reads "/mes", not "/mensual"', async () => {
    await mount(<BillingPage />);

    expect(text()).toContain('Actualizar a Pro');
    expect(text()).toContain('/mes');
    expect(text()).not.toContain('/mensual');
  });

  it('a 503 FEATURE_DISABLED from checkout is explained, not shown raw', async () => {
    vi.spyOn(api.billing, 'checkout').mockRejectedValue(
      new ApiError(503, '{"error":"Los pagos no están activos en esta demo.","code":"FEATURE_DISABLED"}'),
    );
    await mount(<BillingPage />);

    await act(async () => buttonByText(view.container, 'Actualizar a Pro').click());

    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe('Los pagos no están activos en esta demo.');
  });
});

describe('settings hub (QA-056)', () => {
  it('links to billing and says payments are off when they are', async () => {
    serverFeatures(false);
    await mount(<SettingsPage />);

    const billing = buttonByText(view.container, 'FacturaciónTu plan y sus límites. Los pagos no están activos en esta demo.');
    click(billing);

    expect(push).toHaveBeenCalledWith('/settings/billing');
  });

  it('has no "coming soon" placeholder: the account card shows who is signed in', async () => {
    serverFeatures(true);
    await mount(<SettingsPage />);

    expect(text()).not.toContain('Próximamente');
    expect(text()).toContain(`Has iniciado sesión como ${normalUser.username} (${normalUser.email}).`);
  });

  it('QA-058: theme and logout are reachable from settings', async () => {
    serverFeatures(true);
    const logout = vi.spyOn(api.auth, 'logout').mockResolvedValue(undefined);
    await mount(<SettingsPage />);

    expect(view.container.querySelector('[aria-label="Cambiar a modo claro"], [aria-label="Cambiar a modo oscuro"]')).not.toBeNull();
    await act(async () => buttonByText(view.container, 'Cerrar sesión').click());
    expect(logout).toHaveBeenCalledTimes(1);
  });
});

describe('upgrade prompts', () => {
  it('lead to billing when payments are on', async () => {
    serverFeatures(true);
    await mount(<UpgradePrompt feature="Analíticas" />);

    click(buttonByText(view.container, 'Actualizar a Pro'));

    expect(push).toHaveBeenCalledWith('/settings/billing');
  });

  it('QA-018: explain instead of leading to a dead end when payments are off', async () => {
    serverFeatures(false);
    await mount(<UpgradePrompt feature="Analíticas" />);

    expect(view.container.querySelector('button')).toBeNull();
    expect(text()).toContain('los pagos no están activos en esta demo');
  });
});
