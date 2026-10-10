'use client';

import { useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAnalytics } from '@/hooks/useAnalytics';
import { apiErrorMessage } from '@/lib/api-errors';
import UpgradePrompt from '@/components/billing/UpgradePrompt';
import MetricCard from './MetricCard';
import ViewsChart from './ViewsChart';
import ClicksByBlockChart from './ClicksByBlockChart';
import ScrollFunnel from './ScrollFunnel';
import DeviceChart from './DeviceChart';
import ReferrersTable from './ReferrersTable';

interface AnalyticsPanelProps {
  pageId: string;
  pageStatus: string;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

// Skeleton loader
function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-surface-card animate-pulse rounded ${className || ''}`} />;
}

function MetricSkeleton() {
  return (
    <div className="bg-surface-elevated border border-surface-card/80 rounded-xl p-4 flex flex-col gap-2">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-24" />
    </div>
  );
}

export default function AnalyticsPanel({ pageId, pageStatus }: AnalyticsPanelProps) {
  const t = useTranslations();
  const [period, setPeriod] = useState('30d');
  const { data, isLoading: loading, isPlanLimited, hasLoadError, loadError, reload: fetchData } = useAnalytics(pageId, period);
  const periods = [
    { value: '7d', label: t('analytics.period7d') },
    { value: '30d', label: t('analytics.period30d') },
    { value: '90d', label: t('analytics.period90d') },
  ];

  // The plan comes first: publishing would not unlock analytics on a plan without it (QA-044)
  if (isPlanLimited) {
    return (
      <UpgradePrompt
        feature={t('analytics.upgradeFeature')}
        description={t('analytics.upgradeDescription')}
      />
    );
  }

  // Empty state for unpublished pages (once the plan is known to include analytics)
  if (pageStatus !== 'published') {
    if (loading && !data && !hasLoadError) {
      return (
        <div role="status" className="flex items-center justify-center h-full text-sm text-muted">
          {t('analytics.loadingPanel')}
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16">
        <div className="w-16 h-16 rounded-2xl bg-surface-card flex items-center justify-center mb-4">
          <BarChart3 size={28} className="text-muted" />
        </div>
        <h3 className="text-lg font-medium text-primary mb-2">{t('analytics.unavailableTitle')}</h3>
        <p className="text-sm text-muted max-w-xs">
          {t('analytics.unavailableDescription')}
        </p>
      </div>
    );
  }

  if (hasLoadError) {
    return (
      <div role="alert" className="flex flex-col items-center justify-center h-full text-center px-8 py-16">
        <p className="text-sm text-error mb-3">{apiErrorMessage(loadError, t, 'analytics.loadError')}</p>
        <button
          type="button"
          onClick={fetchData}
          className="text-sm text-primary-color hover:text-primary-color/80 flex items-center gap-1"
        >
          <RefreshCw size={14} /> {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header with period selector */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-card/80 shrink-0">
        <h2 className="text-sm font-medium text-primary">{t('analytics.title')}</h2>
        <div className="flex items-center gap-2">
          <div className="flex bg-surface-card rounded-lg p-0.5">
            {periods.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  period === p.value
                    ? 'bg-surface-card text-primary'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            className="p-1.5 text-secondary hover:text-primary transition-colors"
            title={t('analytics.refresh')}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Metric cards */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => <MetricSkeleton key={i} />)}
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <MetricCard
                label={t('analytics.metricViews')}
                value={data.total_views.toLocaleString()}
                currentValue={data.total_views}
                prevValue={data.prev_total_views}
              />
              <MetricCard
                label={t('analytics.metricUnique')}
                value={data.unique_visitors.toLocaleString()}
                currentValue={data.unique_visitors}
                prevValue={data.prev_unique_visitors}
              />
              <MetricCard
                label={t('analytics.metricAvgTime')}
                value={formatTime(data.avg_time_on_page)}
              />
              <MetricCard
                label={t('analytics.metricBounce')}
                value={data.bounce_rate}
                suffix="%"
              />
              <MetricCard
                label={t('analytics.metricCta')}
                value={data.cta_conversions.toLocaleString()}
                currentValue={data.cta_conversions}
                prevValue={data.prev_cta_conversions}
              />
            </div>

            {/* Views over time */}
            <section className="bg-surface-elevated border border-surface-card/80 rounded-xl p-4">
              <h3 className="text-xs text-muted uppercase tracking-wider mb-3">{t('analytics.viewsOverTime')}</h3>
              <ViewsChart data={data.views_over_time} />
            </section>

            {/* Two-column grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Clicks by block */}
              <section className="bg-surface-elevated border border-surface-card/80 rounded-xl p-4">
                <h3 className="text-xs text-muted uppercase tracking-wider mb-3">{t('analytics.clicksByBlock')}</h3>
                <ClicksByBlockChart data={data.clicks_by_block} />
              </section>

              {/* Scroll funnel */}
              <section className="bg-surface-elevated border border-surface-card/80 rounded-xl p-4">
                <h3 className="text-xs text-muted uppercase tracking-wider mb-3">{t('analytics.scrollDepth')}</h3>
                <ScrollFunnel data={data.scroll_depth_distribution} totalPageviews={data.total_views} />
              </section>

              {/* Referrers */}
              <section className="bg-surface-elevated border border-surface-card/80 rounded-xl p-4">
                <h3 className="text-xs text-muted uppercase tracking-wider mb-3">{t('analytics.topReferrers')}</h3>
                <ReferrersTable data={data.top_referrers} />
              </section>

              {/* Device breakdown */}
              <section className="bg-surface-elevated border border-surface-card/80 rounded-xl p-4">
                <h3 className="text-xs text-muted uppercase tracking-wider mb-3">{t('analytics.devices')}</h3>
                <DeviceChart data={data.device_breakdown} />
              </section>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted text-sm">
            {t('analytics.noData')}
          </div>
        )}
      </div>
    </div>
  );
}
