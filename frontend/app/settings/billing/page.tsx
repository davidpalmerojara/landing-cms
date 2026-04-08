'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft, Check, X, Loader2, Crown, CreditCard,
  ExternalLink, AlertCircle, Infinity,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiBillingPlan, ApiSubscription, ApiPayment } from '@/lib/api';
import { useAppLocale } from '@/components/providers/AppIntlProvider';
import { useAuth } from '@/hooks/useAuth';

type BillingCycle = 'monthly' | 'yearly';

export default function BillingPage() {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth({ redirectTo: '/login' });

  const [plans, setPlans] = useState<ApiBillingPlan[]>([]);
  const [subscription, setSubscription] = useState<ApiSubscription | null>(null);
  const [payments, setPayments] = useState<ApiPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [plansRes, subRes, paymentsRes] = await Promise.all([
        api.billing.plans(),
        api.billing.subscription(),
        api.billing.payments(),
      ]);
      setPlans(plansRes);
      setSubscription(subRes.subscription);
      setPayments(paymentsRes.payments);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('billing.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  const handleCheckout = async () => {
    setIsCheckingOut(true);
    setError(null);
    try {
      const { checkout_url } = await api.billing.checkout(cycle);
      window.location.href = checkout_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('billing.checkoutError'));
      setIsCheckingOut(false);
    }
  };

  const handlePortal = async () => {
    setIsOpeningPortal(true);
    setError(null);
    try {
      const { portal_url } = await api.billing.portal();
      window.location.href = portal_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('billing.portalError'));
      setIsOpeningPortal(false);
    }
  };

  if (isAuthLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface text-secondary">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const freePlan = plans.find((p) => p.name === 'free');
  const proPlan = plans.find((p) => p.name === 'pro');
  const currentPlanName = subscription?.plan?.name || 'free';
  const isPro = currentPlanName === 'pro' && (subscription?.status === 'active' || subscription?.status === 'trialing');

  return (
    <div className="min-h-screen bg-surface text-secondary">
      {/* Header */}
      <header className="border-b border-subtle\/80">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-muted hover:text-secondary p-1.5 rounded-md hover:bg-surface-card\/50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xl font-black tracking-tighter" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Paxl</span>
            <span className="font-semibold text-primary">{t('billing.title')}</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm mb-6 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-primary-color animate-spin" />
          </div>
        ) : (
          <>
            {/* Current plan banner */}
            <div className="mb-10 p-6 rounded-xl border border-subtle\/80 bg-surface-elevated\/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted mb-1">{t('billing.currentPlan')}</p>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-primary">
                      {isPro ? t('billing.pro') : t('billing.free')}
                    </h2>
                    {isPro && <Crown className="w-5 h-5 text-amber-400" />}
                  </div>
                  {subscription?.cancel_at_period_end && subscription.current_period_end && (
                    <p className="text-sm text-amber-400 mt-1">
                      {t('billing.cancelAt', { date: new Date(subscription.current_period_end).toLocaleDateString(locale) })}
                    </p>
                  )}
                </div>
                {isPro && (
                  <button
                    onClick={handlePortal}
                    disabled={isOpeningPortal}
                    className="flex items-center gap-2 text-sm text-secondary hover:text-primary bg-surface-card hover:bg-surface-elevated px-4 py-2 rounded-lg transition-colors"
                  >
                    {isOpeningPortal ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CreditCard className="w-4 h-4" />
                    )}
                    {t('billing.manageSubscription')}
                  </button>
                )}
              </div>
            </div>

            {/* Plan comparison */}
            {!isPro && (
              <>
                {/* Cycle toggle */}
                <div className="flex items-center justify-center gap-3 mb-8">
                  <button
                    onClick={() => setCycle('monthly')}
                    className={`text-sm px-4 py-1.5 rounded-lg transition-colors ${
                      cycle === 'monthly'
                        ? 'text-white font-bold'
                        : 'text-secondary hover:text-primary'
                    }`}
                    style={cycle === 'monthly' ? { background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' } : undefined}
                  >
                    {t('billing.monthly')}
                  </button>
                  <button
                    onClick={() => setCycle('yearly')}
                    className={`text-sm px-4 py-1.5 rounded-lg transition-colors flex items-center gap-2 ${
                      cycle === 'yearly'
                        ? 'text-white font-bold'
                        : 'text-secondary hover:text-primary'
                    }`}
                    style={cycle === 'yearly' ? { background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' } : undefined}
                  >
                    {t('billing.yearly')}
                    {proPlan?.price_yearly && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-semibold">
                        -17%
                      </span>
                    )}
                  </button>
                </div>

                {/* Plan cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                  {/* Free */}
                  {freePlan && (
                    <PlanCard
                      plan={freePlan}
                      cycle={cycle}
                      isCurrent={!isPro}
                      onSelect={() => {}}
                      disabled
                    />
                  )}
                  {/* Pro */}
                  {proPlan && (
                    <PlanCard
                      plan={proPlan}
                      cycle={cycle}
                      isCurrent={false}
                      onSelect={handleCheckout}
                      isLoading={isCheckingOut}
                      highlighted
                    />
                  )}
                </div>
              </>
            )}

            {/* Payment history */}
            {payments.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-primary mb-4">{t('billing.paymentHistory')}</h3>
                <div className="border border-subtle\/80 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="border-b border-subtle\/80 text-muted text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-3 font-medium">{t('billing.date')}</th>
                        <th className="text-left px-4 py-3 font-medium">{t('billing.amount')}</th>
                        <th className="text-left px-4 py-3 font-medium">{t('billing.status')}</th>
                        <th className="text-right px-4 py-3 font-medium">{t('billing.invoice')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id} className="border-b border-subtle\/50 last:border-0">
                          <td className="px-4 py-3 text-secondary">
                            {new Date(p.created_at).toLocaleDateString(locale)}
                          </td>
                          <td className="px-4 py-3 text-primary font-medium">
                            {p.amount} {p.currency.toUpperCase()}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                p.status === 'paid'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : p.status === 'failed'
                                  ? 'bg-red-500/10 text-red-400'
                                  : 'bg-surface-card text-secondary'
                              }`}
                            >
                              {p.status === 'paid' ? t('billing.paid') : p.status === 'failed' ? t('billing.failed') : t('billing.refunded')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {p.invoice_url && (
                              <a
                                href={p.invoice_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary-color hover:text-primary-color/80 inline-flex items-center gap-1"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                {t('billing.viewInvoice')}
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// --- Plan card ---

interface PlanCardProps {
  plan: ApiBillingPlan;
  cycle: BillingCycle;
  isCurrent: boolean;
  onSelect: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  highlighted?: boolean;
}

function PlanCard({ plan, cycle, isCurrent, onSelect, isLoading, disabled, highlighted }: PlanCardProps) {
  const t = useTranslations();
  const featureList: Array<{
    key: keyof ApiBillingPlan;
    label: string;
    format?: (v: number | boolean) => string;
  }> = [
    { key: 'max_pages', label: t('billing.featurePages'), format: (v) => (v === -1 ? t('billing.unlimited') : `${v}`) },
    { key: 'max_ai_generations_per_hour', label: t('billing.featureAiPerHour'), format: (v) => (v === -1 ? t('billing.unlimited') : v === 0 ? t('billing.notIncluded') : `${v}`) },
    { key: 'has_analytics', label: t('billing.featureAnalytics') },
    { key: 'has_collaboration', label: t('billing.featureCollaboration') },
    { key: 'has_custom_domain', label: t('billing.featureCustomDomain') },
    { key: 'has_ab_testing', label: t('billing.featureAbTesting') },
    { key: 'remove_watermark', label: t('billing.featureNoWatermark') },
    { key: 'max_version_history', label: t('billing.featureVersionHistory'), format: (v) => (v === -1 ? t('billing.unlimited') : t('billing.versionCount', { count: v as number })) },
  ];
  const price = cycle === 'yearly' && plan.price_yearly
    ? (parseFloat(plan.price_yearly) / 12).toFixed(0)
    : parseFloat(plan.price_monthly).toFixed(0);
  const totalYearly = plan.price_yearly ? parseFloat(plan.price_yearly).toFixed(0) : null;

  return (
    <div
      className={`rounded-xl border p-6 flex flex-col ${
        highlighted
          ? 'border-primary/50 bg-primary\/5 shadow-lg shadow-primary/10'
          : 'border-subtle\/80 bg-surface-elevated\/30'
      }`}
    >
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-lg font-bold text-primary">{plan.display_name}</h3>
        {highlighted && <Crown className="w-4 h-4 text-amber-400" />}
      </div>

      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-primary">${price}</span>
          <span className="text-sm text-muted">/{t('billing.monthly').toLowerCase()}</span>
        </div>
        {cycle === 'yearly' && totalYearly && (
          <p className="text-xs text-muted mt-1">${totalYearly}/{t('billing.yearly').toLowerCase()}</p>
        )}
      </div>

      {/* Features */}
      <ul className="space-y-3 flex-1 mb-6">
        {featureList.map((f) => {
          const value = plan[f.key];
          const isBoolean = typeof value === 'boolean';
          const isEnabled = isBoolean ? value : (value as number) > 0 || (value as number) === -1;

          return (
            <li key={f.key} className="flex items-center gap-2.5 text-sm">
              {isEnabled ? (
                <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                </div>
              ) : (
                <div className="w-4 h-4 rounded-full bg-surface-card flex items-center justify-center shrink-0">
                  <X className="w-2.5 h-2.5 text-muted" />
                </div>
              )}
              <span className={isEnabled ? 'text-secondary' : 'text-muted'}>
                {f.label}
                {f.format && (
                  <span className="text-muted ml-1">
                    ({f.format(value as number)})
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {/* CTA */}
      {isCurrent ? (
        <div className="text-center text-sm text-muted py-2 border border-subtle rounded-lg">
          {t('billing.currentPlan')}
        </div>
      ) : (
        <button
          onClick={onSelect}
          disabled={disabled || isLoading}
          className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
            highlighted
              ? 'text-white font-bold shadow-lg shadow-primary/20 active:scale-[0.98]'
              : 'bg-surface-card text-secondary hover:bg-surface-elevated'
          } disabled:opacity-50`}
          style={highlighted ? { background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' } : undefined}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Crown className="w-4 h-4" />
              {t('upgrade.cta')}
            </>
          )}
        </button>
      )}
    </div>
  );
}
