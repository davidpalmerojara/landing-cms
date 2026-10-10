'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps, PricingData, PricingPlan } from '@/types/blocks';
import EditableText from './EditableText';
import BlockButton from './BlockButton';

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

const buttonClass = 'w-full py-3 rounded-lg border font-medium transition-colors';
const buttonStyle = { borderColor: 'var(--theme-border)', color: 'var(--theme-text)' };
const highlightedButtonClass = 'w-full py-3 rounded-lg font-medium transition-colors';
const highlightedButtonStyle = { backgroundColor: 'var(--theme-primary)', color: 'var(--theme-text-on-primary)' };

function PlanButton({ blockId, plan, index, isPreviewMode }: Pick<PlanCardProps, 'blockId' | 'plan' | 'index' | 'isPreviewMode'>) {
  // On the page a button without text is not shown (QA-040)
  if (isPreviewMode && !plan.buttonText.trim()) return null;
  return (
    <BlockButton
      link={plan.buttonLink}
      isPreviewMode={isPreviewMode}
      className={plan.highlighted ? highlightedButtonClass : buttonClass}
      interactiveClassName={plan.highlighted ? 'hover:opacity-90' : 'hover:opacity-80'}
      style={plan.highlighted ? highlightedButtonStyle : buttonStyle}
    >
      <EditableText blockId={blockId} fieldKey={['plans', index, 'buttonText']} value={plan.buttonText} />
    </BlockButton>
  );
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
      style={{ color: plan.highlighted ? 'var(--theme-inverse-text)' : 'var(--theme-text)' }}
    />
  );
  const price = (
    <EditableText
      blockId={blockId}
      fieldKey={['plans', index, 'price']}
      value={plan.price}
      className="text-4xl font-bold"
      style={{ color: plan.highlighted ? 'var(--theme-inverse-text)' : 'var(--theme-text)' }}
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
              <Check aria-hidden="true" className="w-4 h-4 mt-0.5 shrink-0 opacity-50" />
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
      style={{ backgroundColor: 'var(--theme-inverse-bg)', borderColor: 'var(--theme-primary)' }}
    >
      <div className="flex items-center gap-2">
        {name}
        <span
          className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold"
          style={{ backgroundColor: 'var(--theme-primary)', color: 'var(--theme-text-on-primary)' }}
        >
          {popularBadgeText}
        </span>
      </div>
      <div className="mt-4 mb-6">
        {price}
        <span className="ml-1" style={{ color: 'var(--theme-inverse-muted)' }}>{billingPeriod}</span>
      </div>
      <ul className="space-y-3 mb-8 flex-1">
        {features.map((f, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm"
            style={{ color: 'var(--theme-inverse-muted)' }}
          >
            <Check aria-hidden="true" className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--theme-inverse-accent)' }} />
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
      style={{ backgroundColor: 'var(--block-bg, var(--theme-bg))' }}
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
