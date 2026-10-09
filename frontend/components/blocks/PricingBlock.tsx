'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps, PricingData, PricingPlan } from '@/types/blocks';
import EditableText from './EditableText';
import BlockLink from './BlockLink';
import { safeHref } from '@/lib/safe-link';

/** Grid by number of plans; two plans keep the original two-column layout. */
function gridClass(count: number): string {
  if (count === 1) return 'grid gap-6 max-w-md mx-auto grid-cols-1';
  if (count === 3) return 'grid gap-6 max-w-6xl mx-auto grid-cols-1 @tablet:grid-cols-3';
  if (count >= 4) return 'grid gap-6 max-w-6xl mx-auto grid-cols-1 @tablet:grid-cols-2 @desktop:grid-cols-4';
  return 'grid gap-6 max-w-4xl mx-auto grid-cols-1 @tablet:grid-cols-2';
}

interface PlanCardProps {
  blockId: string;
  plan: PricingPlan;
  index: number;
  billingPeriod: string;
  popularBadgeText: string;
  isPreviewMode: boolean;
}

const buttonClass = 'w-full py-3 rounded-lg border font-medium hover:opacity-80 transition-colors';
const buttonStyle = { borderColor: 'var(--theme-border)', color: 'var(--theme-text)' };
const highlightedButtonClass = 'w-full py-3 rounded-lg font-medium transition-colors hover:opacity-90';
const highlightedButtonStyle = { backgroundColor: 'var(--theme-primary)', color: 'white' };

function PlanButton({ blockId, plan, index, isPreviewMode }: Pick<PlanCardProps, 'blockId' | 'plan' | 'index' | 'isPreviewMode'>) {
  const href = isPreviewMode ? safeHref(plan.buttonLink) : null;
  const className = plan.highlighted ? highlightedButtonClass : buttonClass;
  const style = plan.highlighted ? highlightedButtonStyle : buttonStyle;
  const label = <EditableText blockId={blockId} fieldKey={['plans', index, 'buttonText']} value={plan.buttonText} />;
  if (href) {
    return <BlockLink href={href} className={`${className} block text-center`} style={style}>{label}</BlockLink>;
  }
  return <button className={className} style={style}>{label}</button>;
}

function PlanCard({ blockId, plan, index, billingPeriod, popularBadgeText, isPreviewMode }: PlanCardProps) {
  const features = plan.features.split('\n').filter(Boolean);
  const name = (
    <EditableText
      blockId={blockId}
      fieldKey={['plans', index, 'name']}
      value={plan.name}
      as="h3"
      className="text-lg font-semibold"
      style={{ color: plan.highlighted ? 'var(--theme-bg)' : 'var(--theme-text)' }}
    />
  );
  const price = (
    <EditableText
      blockId={blockId}
      fieldKey={['plans', index, 'price']}
      value={plan.price}
      className="text-4xl font-bold"
      style={{ color: plan.highlighted ? 'var(--theme-bg)' : 'var(--theme-text)' }}
    />
  );

  if (!plan.highlighted) {
    return (
      <div
        className="rounded-2xl border p-8 flex flex-col"
        style={{ backgroundColor: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}
      >
        {name}
        <div className="mt-4 mb-6">
          {price}
          <span style={{ color: 'var(--theme-text-muted)' }} className="ml-1">{billingPeriod}</span>
        </div>
        <ul className="space-y-3 mb-8 flex-1">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--theme-text-muted)' }}>
              <Check className="w-4 h-4 mt-0.5 shrink-0 opacity-50" />
              {f}
            </li>
          ))}
        </ul>
        <PlanButton blockId={blockId} plan={plan} index={index} isPreviewMode={isPreviewMode} />
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-8 flex flex-col border-2 shadow-lg"
      style={{ backgroundColor: 'var(--theme-text)', borderColor: 'var(--theme-primary)' }}
    >
      <div className="flex items-center gap-2">
        {name}
        <span
          className="text-[10px] text-white px-2 py-0.5 rounded-full uppercase tracking-wider font-bold"
          style={{ backgroundColor: 'var(--theme-primary)' }}
        >
          {popularBadgeText}
        </span>
      </div>
      <div className="mt-4 mb-6">
        {price}
        <span className="ml-1" style={{ color: 'var(--theme-text-muted)' }}>{billingPeriod}</span>
      </div>
      <ul className="space-y-3 mb-8 flex-1">
        {features.map((f, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm"
            style={{ color: 'color-mix(in srgb, var(--theme-bg) 70%, transparent)' }}
          >
            <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--theme-accent)' }} />
            {f}
          </li>
        ))}
      </ul>
      <PlanButton blockId={blockId} plan={plan} index={index} isPreviewMode={isPreviewMode} />
    </div>
  );
}

export default function PricingBlock({ blockId, data, isPreviewMode }: BlockProps<PricingData>) {
  const t = useTranslations('blocks');
  const billingPeriod = data.billingPeriod || t('pricingMonthly');
  const popularBadgeText = data.popularBadgeText || t('pricingPopular');

  return (
    <section
      aria-label={t('pricingAria')}
      className={`transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } py-16 px-6 @tablet:py-24 @tablet:px-8`}
      style={{ backgroundColor: 'var(--theme-bg)' }}
    >
      <EditableText
        blockId={blockId}
        fieldKey="title"
        value={data.title}
        as="h2"
        className="text-center mb-4 text-3xl @tablet:text-4xl"
        style={{
          color: 'var(--theme-text)',
          fontFamily: 'var(--bp-font-heading)',
          fontWeight: 'var(--bp-font-weight-heading)' as unknown as number,
        }}
      />
      <EditableText
        blockId={blockId}
        fieldKey="subtitle"
        value={data.subtitle}
        as="p"
        className="text-center mb-12 max-w-2xl mx-auto"
        style={{ color: 'var(--theme-text-muted)' }}
      />

      {data.plans.length > 0 && (
        <div className={gridClass(data.plans.length)}>
          {data.plans.map((plan, index) => (
            <PlanCard
              key={index}
              blockId={blockId}
              plan={plan}
              index={index}
              billingPeriod={billingPeriod}
              popularBadgeText={popularBadgeText}
              isPreviewMode={isPreviewMode}
            />
          ))}
        </div>
      )}
    </section>
  );
}
