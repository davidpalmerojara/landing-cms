'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps } from '@/types/blocks';
import EditableText from './EditableText';

export default function PricingBlock({ blockId, data, isMobile, isPreviewMode }: BlockProps) {
  const t = useTranslations('blocks');
  const plan1Features = ((data.plan1Features as string) || '').split('\n').filter(Boolean);
  const plan2Features = ((data.plan2Features as string) || '').split('\n').filter(Boolean);
  const isHighlighted = data.plan2Highlighted as boolean;

  return (
    <section
      aria-label={t('pricingAria')}
      className={`transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } ${isMobile ? 'py-16 px-6' : 'py-24 px-8'}`}
      style={{ backgroundColor: 'var(--theme-bg)' }}
    >
      <EditableText
        blockId={blockId}
        fieldKey="title"
        value={data.title as string}
        as="h2"
        className={`text-center mb-4 ${
          isMobile ? 'text-3xl' : 'text-4xl'
        }`}
        style={{
          color: 'var(--theme-text)',
          fontFamily: 'var(--bp-font-heading)',
          fontWeight: 'var(--bp-font-weight-heading)' as unknown as number,
        }}
      />
      <EditableText
        blockId={blockId}
        fieldKey="subtitle"
        value={data.subtitle as string}
        as="p"
        className="text-center mb-12 max-w-2xl mx-auto"
        style={{ color: 'var(--theme-text-muted)' }}
      />

      <div
        className={`grid gap-6 max-w-4xl mx-auto ${
          isMobile ? 'grid-cols-1' : 'grid-cols-2'
        }`}
      >
        {/* Plan 1 */}
        <div
          className="rounded-2xl border p-8 flex flex-col"
          style={{ backgroundColor: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}
        >
          <EditableText
            blockId={blockId}
            fieldKey="plan1Name"
            value={data.plan1Name as string}
            as="h3"
            className="text-lg font-semibold"
            style={{ color: 'var(--theme-text)' }}
          />
          <div className="mt-4 mb-6">
            <EditableText
              blockId={blockId}
              fieldKey="plan1Price"
              value={data.plan1Price as string}
              className="text-4xl font-bold"
              style={{ color: 'var(--theme-text)' }}
            />
            <span style={{ color: 'var(--theme-text-muted)' }} className="ml-1">{(data.billingPeriod as string) || t('pricingMonthly')}</span>
          </div>
          <ul className="space-y-3 mb-8 flex-1">
            {plan1Features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                <Check className="w-4 h-4 mt-0.5 shrink-0 opacity-50" />
                {f}
              </li>
            ))}
          </ul>
          <button
            className="w-full py-3 rounded-lg border font-medium hover:opacity-80 transition-colors"
            style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
          >
            <EditableText blockId={blockId} fieldKey="plan1ButtonText" value={data.plan1ButtonText as string} />
          </button>
        </div>

        {/* Plan 2 */}
        <div
          className={`rounded-2xl p-8 flex flex-col ${
            isHighlighted ? 'border-2 shadow-lg' : 'border'
          }`}
          style={isHighlighted
            ? { backgroundColor: 'var(--theme-text)', borderColor: 'var(--theme-primary)' }
            : { backgroundColor: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }
          }
        >
          <div className="flex items-center gap-2">
            <EditableText
              blockId={blockId}
              fieldKey="plan2Name"
              value={data.plan2Name as string}
              as="h3"
              className="text-lg font-semibold"
              style={{ color: isHighlighted ? 'var(--theme-bg)' : 'var(--theme-text)' }}
            />
            {isHighlighted && (
              <span
                className="text-[10px] text-white px-2 py-0.5 rounded-full uppercase tracking-wider font-bold"
                style={{ backgroundColor: 'var(--theme-primary)' }}
              >
                {(data.popularBadgeText as string) || t('pricingPopular')}
              </span>
            )}
          </div>
          <div className="mt-4 mb-6">
            <EditableText
              blockId={blockId}
              fieldKey="plan2Price"
              value={data.plan2Price as string}
              className="text-4xl font-bold"
              style={{ color: isHighlighted ? 'var(--theme-bg)' : 'var(--theme-text)' }}
            />
            <span className="ml-1" style={{ color: isHighlighted ? 'var(--theme-text-muted)' : 'var(--theme-text-muted)' }}>{(data.billingPeriod as string) || t('pricingMonthly')}</span>
          </div>
          <ul className="space-y-3 mb-8 flex-1">
            {plan2Features.map((f, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm"
                style={{ color: isHighlighted ? 'color-mix(in srgb, var(--theme-bg) 70%, transparent)' : 'var(--theme-text-muted)' }}
              >
                <Check
                  className="w-4 h-4 mt-0.5 shrink-0"
                  style={{ color: isHighlighted ? 'var(--theme-accent)' : 'var(--theme-text-muted)' }}
                />
                {f}
              </li>
            ))}
          </ul>
          <button
            className="w-full py-3 rounded-lg font-medium transition-colors hover:opacity-90"
            style={isHighlighted
              ? { backgroundColor: 'var(--theme-primary)', color: 'white' }
              : { borderColor: 'var(--theme-border)', color: 'var(--theme-text)', border: '1px solid var(--theme-border)' }
            }
          >
            <EditableText blockId={blockId} fieldKey="plan2ButtonText" value={data.plan2ButtonText as string} />
          </button>
        </div>
      </div>
    </section>
  );
}
