'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps, FaqData } from '@/types/blocks';
import EditableText from './EditableText';

export default function FaqBlock({ blockId, data, isPreviewMode }: BlockProps<FaqData>) {
  const t = useTranslations('blocks');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // Questions left empty are not shown; the index into data.questions is kept for editing
  const questions = data.questions
    .map((item, dataIndex) => ({ ...item, dataIndex }))
    .filter((item) => item.question);

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
        value={data.title}
        as="h2"
        className="text-center mb-12 text-3xl @tablet:text-4xl"
        style={{ color: 'var(--theme-text)', fontFamily: 'var(--bp-font-heading)', fontWeight: 'var(--bp-font-weight-heading)' as unknown as number }}
      />

      {questions.length > 0 && (
        <div className="max-w-3xl mx-auto divide-y" style={{ borderColor: 'var(--theme-border)' }}>
          {questions.map((item, index) => {
            const isOpen = !isPreviewMode || openIndex === index;

            return (
              <div key={item.dataIndex} className="py-5 @tablet:py-6" style={{ borderColor: 'var(--theme-border)' }}>
                {isPreviewMode ? (
                  <button
                    onClick={() => setOpenIndex(openIndex === index ? null : index)}
                    aria-expanded={openIndex === index}
                    className="w-full flex items-center justify-between text-left font-semibold text-base @tablet:text-lg"
                    style={{ color: 'var(--theme-text)' }}
                  >
                    <span>{item.question}</span>
                    <ChevronDown
                      className={`w-5 h-5 shrink-0 ml-4 transition-transform ${openIndex === index ? 'rotate-180' : ''}`}
                      style={{ color: 'var(--theme-text-muted)' }}
                    />
                  </button>
                ) : (
                  <EditableText
                    blockId={blockId}
                    fieldKey={['questions', item.dataIndex, 'question']}
                    value={item.question}
                    as="h3"
                    className="font-semibold mb-2 text-base @tablet:text-lg"
                    style={{ color: 'var(--theme-text)' }}
                  />
                )}
                {isOpen && (
                  <EditableText
                    blockId={blockId}
                    fieldKey={['questions', item.dataIndex, 'answer']}
                    value={item.answer}
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
      )}
    </section>
  );
}
