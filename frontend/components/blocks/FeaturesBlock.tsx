'use client';

import { Smartphone, Monitor, Zap, Shield, Sparkles, Layers } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps, FeaturesData } from '@/types/blocks';
import EditableText from './EditableText';

/** Icon and accent colour of each card, cycled by position. */
const FEATURE_ICONS = [Smartphone, Monitor, Zap, Shield, Sparkles, Layers];
const FEATURE_ACCENTS = ['var(--theme-primary)', 'var(--theme-secondary)'];

export default function FeaturesBlock({ blockId, data, isPreviewMode }: BlockProps<FeaturesData>) {
  const t = useTranslations('blocks');
  return (
    <section
      aria-label={t('featuresAria')}
      className={`transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } py-16 px-6 @tablet:py-24 @tablet:px-8`}
      style={{ backgroundColor: 'var(--block-bg, var(--theme-surface))' }}
    >
      <EditableText
        blockId={blockId}
        fieldKey="title"
        value={data.title}
        as="h2"
        className="text-center mb-12 transition-all text-3xl @tablet:text-4xl @tablet:mb-16"
        style={{
          color: 'var(--theme-text)',
          fontFamily: 'var(--bp-font-heading)',
          fontWeight: 'var(--bp-font-weight-heading)' as unknown as number,
        }}
      />
      {data.features.length > 0 && (
        <div
          className="grid gap-6 max-w-5xl mx-auto transition-all grid-cols-1 @tablet:grid-cols-2"
        >
          {data.features.map((feature, index) => {
            const Icon = FEATURE_ICONS[index % FEATURE_ICONS.length];
            const accent = FEATURE_ACCENTS[index % FEATURE_ACCENTS.length];
            return (
              <div
                key={index}
                className="rounded-3xl shadow-sm border hover:shadow-md transition-all p-6 @tablet:p-10"
                style={{ backgroundColor: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 @tablet:mb-8"
                  style={{ backgroundColor: `color-mix(in srgb, ${accent} 10%, transparent)`, color: accent }}
                >
                  <Icon aria-hidden="true" className="w-6 h-6 @tablet:w-7 @tablet:h-7" />
                </div>
                <EditableText
                  blockId={blockId}
                  fieldKey={['features', index, 'title']}
                  value={feature.title}
                  as="h3"
                  className="font-semibold mb-3 text-lg @tablet:text-xl @tablet:mb-4"
                  style={{ color: 'var(--theme-text)' }}
                />
                <EditableText
                  blockId={blockId}
                  fieldKey={['features', index, 'description']}
                  value={feature.description}
                  as="p"
                  multiline
                  className="leading-relaxed text-base @tablet:text-lg"
                  style={{ color: 'var(--theme-text-muted)' }}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
