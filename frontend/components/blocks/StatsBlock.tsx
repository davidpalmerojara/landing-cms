'use client';

import { useTranslations } from 'next-intl';
import type { BlockProps, StatsData } from '@/types/blocks';
import EditableText from './EditableText';

export default function StatsBlock({ blockId, data, isPreviewMode }: BlockProps<StatsData>) {
  const t = useTranslations('blocks');

  return (
    <section
      aria-label={t('statsAria')}
      className={`transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } py-16 px-6 @tablet:py-24 @tablet:px-8`}
      style={{ backgroundColor: 'var(--block-bg, var(--theme-inverse-bg))', color: 'var(--theme-inverse-text)' }}
    >
      <div className="max-w-5xl mx-auto">
        <EditableText
          blockId={blockId}
          fieldKey="title"
          value={data.title}
          as="h2"
          className="text-center mb-4 text-3xl @tablet:text-4xl"
          style={{ color: 'var(--theme-inverse-text)', fontFamily: 'var(--bp-font-heading)', fontWeight: 'var(--bp-font-weight-heading)' as unknown as number }}
        />
        <EditableText
          blockId={blockId}
          fieldKey="subtitle"
          value={data.subtitle}
          as="p"
          multiline
          className="text-center max-w-2xl mx-auto mb-12 text-base @tablet:text-lg"
          style={{ color: 'var(--theme-inverse-muted)' }}
        />
        {data.stats.length > 0 && (
          <div className="grid gap-8 grid-cols-2 @tablet:grid-cols-4">
            {data.stats.map((stat, index) => (
              <div key={index} className="text-center">
                <EditableText
                  blockId={blockId}
                  fieldKey={['stats', index, 'value']}
                  value={stat.value}
                  as="div"
                  className="font-bold mb-2 text-3xl @tablet:text-4xl"
                  style={{ color: 'var(--theme-inverse-accent)' }}
                />
                <EditableText
                  blockId={blockId}
                  fieldKey={['stats', index, 'label']}
                  value={stat.label}
                  as="div"
                  className="text-sm uppercase tracking-wider font-medium"
                  style={{ color: 'var(--theme-inverse-muted)' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
