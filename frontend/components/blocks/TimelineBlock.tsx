'use client';

import { useTranslations } from 'next-intl';
import type { BlockProps } from '@/types/blocks';
import EditableText from './EditableText';

export default function TimelineBlock({ blockId, data, isMobile, isPreviewMode }: BlockProps) {
  const t = useTranslations('blocks');
  const items = [
    { dateKey: 'item1Date', titleKey: 'item1Title', descKey: 'item1Desc' },
    { dateKey: 'item2Date', titleKey: 'item2Title', descKey: 'item2Desc' },
    { dateKey: 'item3Date', titleKey: 'item3Title', descKey: 'item3Desc' },
  ];

  return (
    <section
      aria-label={t('timelineAria')}
      className={`transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } ${isMobile ? 'py-16 px-6' : 'py-24 px-8'}`}
      style={{ backgroundColor: 'var(--theme-bg)' }}
    >
      <div className="max-w-3xl mx-auto">
        <EditableText
          blockId={blockId}
          fieldKey="title"
          value={data.title as string}
          as="h2"
          className={`text-center mb-12 ${
            isMobile ? 'text-3xl' : 'text-4xl'
          }`}
          style={{ color: 'var(--theme-text)', fontFamily: 'var(--bp-font-heading)', fontWeight: 'var(--bp-font-weight-heading)' as unknown as number }}
        />
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5" style={{ backgroundColor: 'var(--theme-border)' }} />

          <div className="space-y-10">
            {items.map((item, i) => (
              <div key={item.dateKey} className="relative pl-12">
                {/* Dot */}
                <div
                  className="absolute left-2.5 top-1 w-3 h-3 rounded-full border-2"
                  style={i === 0
                    ? { backgroundColor: 'var(--theme-primary)', borderColor: 'var(--theme-primary)' }
                    : { backgroundColor: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }
                  }
                />

                <EditableText
                  blockId={blockId}
                  fieldKey={item.dateKey}
                  value={data[item.dateKey] as string}
                  as="span"
                  className="text-sm font-medium mb-1 block"
                  style={{ color: 'var(--theme-primary)' }}
                />
                <EditableText
                  blockId={blockId}
                  fieldKey={item.titleKey}
                  value={data[item.titleKey] as string}
                  as="h3"
                  className="font-semibold text-lg mb-2"
                  style={{ color: 'var(--theme-text)' }}
                />
                <EditableText
                  blockId={blockId}
                  fieldKey={item.descKey}
                  value={data[item.descKey] as string}
                  as="p"
                  multiline
                  className="leading-relaxed"
                  style={{ color: 'var(--theme-text-muted)' }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
