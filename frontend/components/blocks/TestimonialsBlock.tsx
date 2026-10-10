'use client';

import { Quote } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps, TestimonialsData } from '@/types/blocks';
import EditableText from './EditableText';

export default function TestimonialsBlock({ blockId, data, isPreviewMode }: BlockProps<TestimonialsData>) {
  const t = useTranslations('blocks');
  return (
    <section
      aria-label={t('testimonialsAria')}
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
        className="text-center mb-12 transition-all text-3xl @tablet:text-4xl @tablet:mb-16"
        style={{ color: 'var(--theme-text)', fontFamily: 'var(--bp-font-heading)', fontWeight: 'var(--bp-font-weight-heading)' as unknown as number }}
      />
      {data.testimonials.length > 0 && (
        <div
          className="grid gap-6 max-w-5xl mx-auto transition-all grid-cols-1 @tablet:grid-cols-2"
        >
          {data.testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="p-8 rounded-3xl border relative hover:shadow-md transition-shadow"
              style={{ backgroundColor: 'var(--theme-surface)', borderColor: 'var(--theme-border)' }}
            >
              <Quote aria-hidden="true" className="w-8 h-8 mb-4" style={{ color: 'color-mix(in srgb, var(--theme-primary) 30%, transparent)' }} />
              <blockquote
                className="mb-8 leading-relaxed italic text-base @tablet:text-lg"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                &ldquo;<EditableText
                  blockId={blockId}
                  fieldKey={['testimonials', index, 'quote']}
                  value={testimonial.quote}
                  multiline
                />&rdquo;
              </blockquote>
              <div className="flex items-center gap-4 mt-auto">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl shrink-0"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 15%, transparent)', color: 'var(--theme-primary-text)' }}
                >
                  {testimonial.author.charAt(0) || '?'}
                </div>
                <div>
                  <EditableText
                    blockId={blockId}
                    fieldKey={['testimonials', index, 'author']}
                    value={testimonial.author}
                    as="h3"
                    className="font-semibold"
                    style={{ color: 'var(--theme-text)' }}
                  />
                  <EditableText
                    blockId={blockId}
                    fieldKey={['testimonials', index, 'role']}
                    value={testimonial.role}
                    as="p"
                    className="text-sm"
                    style={{ color: 'var(--theme-text-muted)' }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
