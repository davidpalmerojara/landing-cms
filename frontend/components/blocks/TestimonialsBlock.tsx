'use client';

import { Quote } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps } from '@/types/blocks';
import EditableText from './EditableText';

export default function TestimonialsBlock({ blockId, data, isMobile, isPreviewMode }: BlockProps) {
  const t = useTranslations('blocks');
  return (
    <section
      aria-label={t('testimonialsAria')}
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
        className={`text-center mb-12 transition-all ${
          isMobile ? 'text-3xl' : 'text-4xl mb-16'
        }`}
        style={{ color: 'var(--theme-text)', fontFamily: 'var(--bp-font-heading)', fontWeight: 'var(--bp-font-weight-heading)' as unknown as number }}
      />
      <div
        className={`grid gap-6 max-w-5xl mx-auto transition-all ${
          isMobile ? 'grid-cols-1' : 'grid-cols-2'
        }`}
      >
        {[1, 2].map((num) => (
          <div
            key={num}
            className="p-8 rounded-3xl border relative hover:shadow-md transition-shadow"
            style={{ backgroundColor: 'var(--theme-surface)', borderColor: 'var(--theme-border)' }}
          >
            <Quote className="w-8 h-8 mb-4" style={{ color: 'color-mix(in srgb, var(--theme-primary) 30%, transparent)' }} />
            <blockquote
              className={`mb-8 leading-relaxed italic ${
                isMobile ? 'text-base' : 'text-lg'
              }`}
              style={{ color: 'var(--theme-text-muted)' }}
            >
              &ldquo;<EditableText
                blockId={blockId}
                fieldKey={`quote${num}`}
                value={data[`quote${num}`] as string}
                multiline
              />&rdquo;
            </blockquote>
            <div className="flex items-center gap-4 mt-auto">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl shrink-0"
                style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 15%, transparent)', color: 'var(--theme-primary)' }}
              >
                {(data[`author${num}`] as string)?.charAt(0) || '?'}
              </div>
              <div>
                <EditableText
                  blockId={blockId}
                  fieldKey={`author${num}`}
                  value={data[`author${num}`] as string}
                  as="h4"
                  className="font-semibold"
                  style={{ color: 'var(--theme-text)' }}
                />
                <EditableText
                  blockId={blockId}
                  fieldKey={`role${num}`}
                  value={data[`role${num}`] as string}
                  as="p"
                  className="text-sm"
                  style={{ color: 'var(--theme-text-muted)' }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
