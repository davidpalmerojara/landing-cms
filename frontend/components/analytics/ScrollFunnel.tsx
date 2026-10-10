'use client';

import { useTranslations } from 'next-intl';

interface ScrollFunnelProps {
  data: Record<number, number>;
  totalPageviews: number;
}

export default function ScrollFunnel({ data, totalPageviews }: ScrollFunnelProps) {
  const t = useTranslations('analytics');
  const steps = [
    { label: t('pageviewsStep'), value: totalPageviews },
    { label: '25%', value: data[25] || 0 },
    { label: '50%', value: data[50] || 0 },
    { label: '75%', value: data[75] || 0 },
    { label: '100%', value: data[100] || 0 },
  ];

  const max = Math.max(...steps.map((s) => s.value), 1);

  return (
    <div className="flex flex-col gap-2">
      {/* What the red figure means: visits lost since the previous step (QA-087) */}
      <p className="text-[11px] text-muted leading-relaxed mb-1">{t('scrollFunnelHint')}</p>
      {steps.map((step, i) => {
        const pct = Math.round((step.value / max) * 100);
        const dropoff = i > 0 && steps[i - 1].value > 0
          ? Math.round(((steps[i - 1].value - step.value) / steps[i - 1].value) * 100)
          : 0;

        return (
          <div key={step.label} className="flex items-center gap-3">
            <span className="text-xs text-secondary w-16 text-right">{step.label}</span>
            <div className="flex-1 h-6 bg-surface-card rounded overflow-hidden relative">
              <div
                className="h-full bg-primary/80 rounded transition-all"
                style={{ width: `${pct}%` }}
              />
              <span className="absolute inset-0 flex items-center px-2 text-xs text-primary font-medium">
                {step.value}
              </span>
            </div>
            <span className="text-xs text-error w-12 text-right shrink-0">
              {i > 0 && dropoff > 0 && (
                <>
                  <span aria-hidden="true">−{dropoff} %</span>
                  <span className="sr-only">{t('scrollDropoff', { percent: dropoff })}</span>
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
