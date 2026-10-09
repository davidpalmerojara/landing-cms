'use client';

import { useTranslations } from 'next-intl';
import type { BlockProps } from '@/types/blocks';
import EditableText from './EditableText';

export default function StatsBlock({ blockId, data, isPreviewMode }: BlockProps) {
  const t = useTranslations('blocks');
  const stats = [
    { valueKey: 'stat1Value', labelKey: 'stat1Label' },
    { valueKey: 'stat2Value', labelKey: 'stat2Label' },
    { valueKey: 'stat3Value', labelKey: 'stat3Label' },
    { valueKey: 'stat4Value', labelKey: 'stat4Label' },
  ];

  return (
    <section
      aria-label={t('statsAria')}
      className={`transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } py-16 px-6 @tablet:py-24 @tablet:px-8`}
      style={{ backgroundColor: 'var(--theme-text)', color: 'var(--theme-bg)' }}
    >
      <div className="max-w-5xl mx-auto">
        <EditableText
          blockId={blockId}
          fieldKey="title"
          value={data.title as string}
          as="h2"
          className="text-center mb-4 text-3xl @tablet:text-4xl"
          style={{ color: 'var(--theme-bg)', fontFamily: 'var(--bp-font-heading)', fontWeight: 'var(--bp-font-weight-heading)' as unknown as number }}
        />
        <EditableText
          blockId={blockId}
          fieldKey="subtitle"
          value={data.subtitle as string}
          as="p"
          multiline
          className="text-center max-w-2xl mx-auto mb-12 opacity-60 text-base @tablet:text-lg"
          style={{ color: 'var(--theme-bg)' }}
        />
        <div className="grid gap-8 grid-cols-2 @tablet:grid-cols-4">
          {stats.map((s) => (
            <div key={s.valueKey} className="text-center">
              <EditableText
                blockId={blockId}
                fieldKey={s.valueKey}
                value={data[s.valueKey] as string}
                as="div"
                className="font-bold mb-2 text-3xl @tablet:text-4xl"
                style={{ color: 'var(--theme-accent)' }}
              />
              <EditableText
                blockId={blockId}
                fieldKey={s.labelKey}
                value={data[s.labelKey] as string}
                as="div"
                className="text-sm uppercase tracking-wider font-medium opacity-60"
                style={{ color: 'var(--theme-bg)' }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
