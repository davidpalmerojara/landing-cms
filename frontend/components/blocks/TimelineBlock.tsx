'use client';

import { useTranslations } from 'next-intl';
import type { BlockProps, TimelineData } from '@/types/blocks';
import EditableText from './EditableText';

export default function TimelineBlock({ blockId, data, isPreviewMode }: BlockProps<TimelineData>) {
  const t = useTranslations('blocks');

  return (
    <section
      aria-label={t('timelineAria')}
      className={`transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } py-16 px-6 @tablet:py-24 @tablet:px-8`}
      style={{ backgroundColor: 'var(--theme-bg)' }}
    >
      <div className="max-w-3xl mx-auto">
        <EditableText
          blockId={blockId}
          fieldKey="title"
          value={data.title}
          as="h2"
          className="text-center mb-12 text-3xl @tablet:text-4xl"
          style={{ color: 'var(--theme-text)', fontFamily: 'var(--bp-font-heading)', fontWeight: 'var(--bp-font-weight-heading)' as unknown as number }}
        />
        {data.events.length > 0 && (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5" style={{ backgroundColor: 'var(--theme-border)' }} />

            <div className="space-y-10">
              {data.events.map((event, i) => (
                <div key={i} className="relative pl-12">
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
                    fieldKey={['events', i, 'date']}
                    value={event.date}
                    as="span"
                    className="text-sm font-medium mb-1 block"
                    style={{ color: 'var(--theme-primary)' }}
                  />
                  <EditableText
                    blockId={blockId}
                    fieldKey={['events', i, 'title']}
                    value={event.title}
                    as="h3"
                    className="font-semibold text-lg mb-2"
                    style={{ color: 'var(--theme-text)' }}
                  />
                  <EditableText
                    blockId={blockId}
                    fieldKey={['events', i, 'description']}
                    value={event.description}
                    as="p"
                    multiline
                    className="leading-relaxed"
                    style={{ color: 'var(--theme-text-muted)' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
