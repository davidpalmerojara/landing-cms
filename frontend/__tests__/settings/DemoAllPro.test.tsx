/** C1 (ADR-051): while payments are off every account has the Pro features, and the interface says so. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import BillingPage from '@/app/settings/billing/page';
import PricingPage from '@/app/pricing/page';
import UpgradePrompt from '@/components/billing/UpgradePrompt';
import { api } from '@/lib/api';
import type { ApiBillingPlan } from '@/lib/api';
import { normalUser } from '../guest/test-helpers';
import { render, type RenderResult } from '../mobile-editor/test-utils';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/pricing',
}));
vi.mock('@/components/ui/LocaleSwitcher', () => ({ default: () => null }));
vi.mock('@/components/ui/ThemeToggle', () => ({ default: () => null }));
vi.mock('@/components/marketing/MobileMenu', () => ({ default: () => null }));
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
  max_ai_generations_per_hour: 20, has_analytics: true, has_collaboration: true, remove_watermark: true, max_version_history: 50,
};

function demoServer(demoAllPro: boolean) {
  vi.spyOn(api.features, 'get').mockResolvedValue({ custom_domains: false, billing: false, demo_all_pro: demoAllPro });
}

async function mount(ui: React.ReactElement) {
  await act(async () => {
    view = render(ui);
  });
  await act(async () => {});
}

const text = () => view.container.textContent ?? '';

beforeEach(() => {
  vi.spyOn(api.auth, 'me').mockResolvedValue(normalUser);
  vi.spyOn(api.billing, 'plans').mockResolvedValue([free, pro]);
  vi.spyOn(api.billing, 'payments').mockResolvedValue({ payments: [] });
  // A Free subscription is stored; the account has Pro because of the demo
  vi.spyOn(api.billing, 'subscription').mockResolvedValue({
    subscription: {
      id: 's1', plan: free, status: 'free', billing_cycle: null, current_period_start: null,
      current_period_end: null, cancel_at_period_end: false, trial_end: null, created_at: '2026-10-01T00:00:00Z',
    },
    effective_plan: pro,
    demo_all_pro: true,
  });
});

afterEach(() => {
  view.unmount();
  vi.restoreAllMocks();
});

describe('billing page in the demo', () => {
  it('shows the account as Pro (demo) with its features and no plans to choose from', async () => {
    demoServer(true);
    await mount(<BillingPage />);

    expect(view.container.querySelector('[role="note"]')?.textContent).toContain('todas las cuentas tienen las funciones del plan Pro');
    expect(text()).toContain('Pro (demo)');
    expect(view.container.querySelectorAll('main ul li').length).toBeGreaterThan(3);
    expect(text()).not.toContain('Mensual');
    expect(text()).not.toContain('Actualizar a Pro');
    // The old "payments are not active, Pro cannot be bought" note would contradict it
    expect(text()).not.toContain('el plan Pro no se puede contratar');
  });
});

describe('pricing page in the demo', () => {
  it('says every account has Pro, marks the Pro card as included and the Free card as not applied', async () => {
    demoServer(true);
    await mount(<PricingPage />);

    expect(text()).toContain('En esta demo todas las cuentas tienen las funciones del plan Pro');
    expect(text()).toContain('Incluido en la demo');
    expect(text()).toContain('En esta demo no se aplica: tu cuenta tiene las funciones de Pro.');
  });

  it('without the demo flag it keeps the payments-off explanation', async () => {
    demoServer(false);
    await mount(<PricingPage />);

    expect(text()).toContain('el plan Pro todavía no se puede contratar');
    expect(text()).not.toContain('Incluido en la demo');
  });
});

describe('upgrade prompts in the demo', () => {
  it('never lead to a purchase and say every account has Pro', async () => {
    demoServer(true);
    await mount(<UpgradePrompt feature="Analíticas" />);

    expect(view.container.querySelector('button')).toBeNull();
    expect(text()).toContain('todas las cuentas tienen las funciones Pro');
  });
});
