'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { planFeatures } from '@/lib/plan-features';
import PlanFeatureList from '@/components/billing/PlanFeatureList';
import {
  ArrowLeft, Loader2, Crown, CreditCard, ExternalLink, AlertCircle, Info, FlaskConical,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiBillingPlan } from '@/lib/api';
import { accountErrorMessage } from '@/lib/account-errors';
import { useAppLocale } from '@/components/providers/AppIntlProvider';
import { useAuth } from '@/hooks/useAuth';
import { useBillingEnabled } from '@/hooks/useBillingEnabled';
import { useBillingOverview } from '@/hooks/useBillingOverview';
import { useFeatures } from '@/hooks/useFeatures';
import GuestSettingsScreen from '@/components/guest/GuestSettingsScreen';

type BillingCycle = 'monthly' | 'yearly';

export default function BillingPage() {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const router = useRouter();
  const { user, setUser, isLoading: isAuthLoading } = useAuth({ redirectTo: '/login' });

  // A guest session has no plan to manage: it never reaches the billing API
  const { plans, subscription, payments, isLoading, hasError, error: loadFailure } = useBillingOverview({
    enabled: Boolean(user && !user.is_guest),
  });
  const { features } = useFeatures();
  const { billingEnabled, isKnown: isBillingKnown } = useBillingEnabled();
  const showCustomDomains = features?.custom_domains ?? false;
  const [actionError, setActionError] = useState<string | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const loadError = hasError ? accountErrorMessage(loadFailure, t, 'billing.loadError') : null;
  const error = actionError ?? loadError;

  const handleCheckout = async () => {
    setIsCheckingOut(true);
    setActionError(null);
    try {
      const { checkout_url } = await api.billing.checkout(cycle);
      window.location.href = checkout_url;
    } catch (e) {
      setActionError(accountErrorMessage(e, t, 'billing.checkoutError'));
      setIsCheckingOut(false);
    }
  };

  const handlePortal = async () => {
    setIsOpeningPortal(true);
    setActionError(null);
    try {
      const { portal_url } = await api.billing.portal();
      window.location.href = portal_url;
    } catch (e) {
      setActionError(accountErrorMessage(e, t, 'billing.portalError'));
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

  if (user.is_guest) {
    return (
      <GuestSettingsScreen
        user={user}
        onClaimed={setUser}
        title={t('guest.billingTitle')}
        description={t('guest.billingBody')}
        backHref="/dashboard"
      />
    );
  }

  const freePlan = plans.find((p) => p.name === 'free');
  const proPlan = plans.find((p) => p.name === 'pro');
  const currentPlanName = subscription?.plan?.name || 'free';
  const isPro = currentPlanName === 'pro' && (subscription?.status === 'active' || subscription?.status === 'trialing');

  return (
    <div className="min-h-screen bg-surface text-secondary">
      {/* Header */}
      <header className="border-b border-subtle/80">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            aria-label={t('common.backToDashboard')}
            className="text-muted hover:text-secondary p-1.5 rounded-md hover:bg-surface-card/50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xl font-black tracking-tighter" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{t('common.brand')}</span>
            <h1 className="font-semibold text-primary">{t('billing.title')}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {error && (
          <div role="alert" className="flex items-center gap-2 text-error text-sm mb-6 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Payments run only with a Stripe test key (ADR-031): say which mode this is */}
        {isBillingKnown && !billingEnabled && (
          <p role="note" className="flex items-start gap-2 text-sm text-secondary mb-6 bg-surface-elevated/60 border border-subtle rounded-lg px-4 py-3">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary-color" aria-hidden="true" />
            {t('billing.paymentsOff')}
          </p>
        )}
        {billingEnabled && (
          <p role="note" className="flex items-start gap-2 text-sm text-secondary mb-6 bg-warning/10 border border-warning/30 rounded-lg px-4 py-3">
            <FlaskConical className="w-4 h-4 mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            {t('billing.testMode')}
          </p>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-primary-color animate-spin" />
          </div>
        ) : (
          <>
            {/* Current plan banner */}
            <div className="mb-10 p-6 rounded-xl border border-subtle/80 bg-surface-elevated/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted mb-1">{t('billing.currentPlan')}</p>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-primary">
                      {isPro ? t('billing.pro') : t('billing.free')}
                    </h2>
                    {isPro && <Crown className="w-5 h-5 text-warning" />}
                  </div>
                  {subscription?.cancel_at_period_end && subscription.current_period_end && (
                    <p className="text-sm text-warning mt-1">
                      {t('billing.cancelAt', { date: new Date(subscription.current_period_end).toLocaleDateString(locale) })}
                    </p>
                  )}
                </div>
                {isPro && billingEnabled && (
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
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                          cycle === 'yearly' ? 'bg-white/20 text-white' : 'bg-emerald-500/20 text-success'
                        }`}
                      >
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
                      showCustomDomains={showCustomDomains}
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
                      canUpgrade={billingEnabled}
                      showCustomDomains={showCustomDomains}
                    />
                  )}
                </div>
              </>
            )}

            {/* Payment history */}
            {payments.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-primary mb-4">{t('billing.paymentHistory')}</h3>
                <div className="border border-subtle/80 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="border-b border-subtle/80 text-muted text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-3 font-medium">{t('billing.date')}</th>
                        <th className="text-left px-4 py-3 font-medium">{t('billing.amount')}</th>
                        <th className="text-left px-4 py-3 font-medium">{t('billing.status')}</th>
                        <th className="text-right px-4 py-3 font-medium">{t('billing.invoice')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id} className="border-b border-subtle/50 last:border-0">
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
                                  ? 'bg-emerald-500/10 text-success'
                                  : p.status === 'failed'
                                  ? 'bg-red-500/10 text-error'
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
  /** False when this deployment takes no payments: the card says so instead of offering the upgrade */
  canUpgrade?: boolean;
  /** Custom domains exist on this deployment: list them among the plan's features */
  showCustomDomains: boolean;
}

function PlanCard({ plan, cycle, isCurrent, onSelect, isLoading, disabled, highlighted, canUpgrade = true, showCustomDomains }: PlanCardProps) {
  const t = useTranslations();
  const features = planFeatures(plan, t, { customDomains: showCustomDomains });
  const price = cycle === 'yearly' && plan.price_yearly
    ? (parseFloat(plan.price_yearly) / 12).toFixed(0)
    : parseFloat(plan.price_monthly).toFixed(0);
  const totalYearly = plan.price_yearly ? parseFloat(plan.price_yearly).toFixed(0) : null;

  return (
    <div
      className={`rounded-xl border p-6 flex flex-col ${
        highlighted
          ? 'border-primary/50 bg-primary/5 shadow-lg shadow-primary/10'
          : 'border-subtle/80 bg-surface-elevated/30'
      }`}
    >
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-lg font-bold text-primary">{plan.display_name}</h3>
        {highlighted && <Crown className="w-4 h-4 text-warning" />}
      </div>

      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-primary">${price}</span>
          <span className="text-sm text-muted">{t('billing.perMonth')}</span>
        </div>
        {cycle === 'yearly' && totalYearly && (
          <p className="text-xs text-muted mt-1">${totalYearly}/{t('billing.yearly').toLowerCase()}</p>
        )}
      </div>

      {/* Features */}
      <div className="flex-1 mb-6">
        <PlanFeatureList
          features={features}
          includedLabel={t('billing.included')}
          notIncludedLabel={t('billing.notIncluded')}
        />
      </div>

      {/* CTA */}
      {isCurrent ? (
        <div className="text-center text-sm text-muted py-2 border border-subtle rounded-lg">
          {t('billing.currentPlan')}
        </div>
      ) : !canUpgrade ? (
        <div className="text-center text-sm text-muted py-2 border border-subtle rounded-lg">
          {t('billing.unavailableInDemo')}
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
