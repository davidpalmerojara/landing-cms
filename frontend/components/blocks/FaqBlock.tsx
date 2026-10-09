'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps } from '@/types/blocks';
import EditableText from './EditableText';

export default function FaqBlock({ blockId, data, isPreviewMode }: BlockProps) {
  const t = useTranslations('blocks');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const questions = [
    { q: 'q1', a: 'a1' },
    { q: 'q2', a: 'a2' },
    { q: 'q3', a: 'a3' },
  ].filter((item) => data[item.q]);

  return (
    <section
      aria-label={t('faqAria')}
      className={`transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } py-16 px-6 @tablet:py-24 @tablet:px-8`}
      style={{ backgroundColor: 'var(--theme-bg)' }}
    >
      <EditableText
        blockId={blockId}
        fieldKey="title"
        value={data.title as string}
        as="h2"
        className="text-center mb-12 text-3xl @tablet:text-4xl"
        style={{ color: 'var(--theme-text)', fontFamily: 'var(--bp-font-heading)', fontWeight: 'var(--bp-font-weight-heading)' as unknown as number }}
      />

      <div className="max-w-3xl mx-auto divide-y" style={{ borderColor: 'var(--theme-border)' }}>
        {questions.map((item, index) => {
          const isOpen = !isPreviewMode || openIndex === index;

          return (
            <div key={item.q} className="py-5 @tablet:py-6" style={{ borderColor: 'var(--theme-border)' }}>
              {isPreviewMode ? (
                <button
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  aria-expanded={openIndex === index}
                  className="w-full flex items-center justify-between text-left font-semibold text-base @tablet:text-lg"
                  style={{ color: 'var(--theme-text)' }}
                >
                  <span>{data[item.q] as string}</span>
                  <ChevronDown
                    className={`w-5 h-5 shrink-0 ml-4 transition-transform ${openIndex === index ? 'rotate-180' : ''}`}
                    style={{ color: 'var(--theme-text-muted)' }}
                  />
                </button>
              ) : (
                <EditableText
                  blockId={blockId}
                  fieldKey={item.q}
                  value={data[item.q] as string}
                  as="h3"
                  className="font-semibold mb-2 text-base @tablet:text-lg"
                  style={{ color: 'var(--theme-text)' }}
                />
              )}
              {isOpen && (
                <EditableText
                  blockId={blockId}
                  fieldKey={item.a}
                  value={data[item.a] as string}
                  as="p"
                  multiline
                  className={`leading-relaxed ${isPreviewMode ? 'mt-3' : ''} text-sm @tablet:text-base`}
                  style={{ color: 'var(--theme-text-muted)' }}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
