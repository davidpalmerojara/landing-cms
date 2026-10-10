'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps, FaqData } from '@/types/blocks';
import EditableText from './EditableText';

export default function FaqBlock({ blockId, data, isPreviewMode }: BlockProps<FaqData>) {
  const t = useTranslations('blocks');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const idPrefix = useId();

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
      style={{ backgroundColor: 'var(--block-bg, var(--theme-bg))' }}
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
            const isOpen = openIndex === index;
            const answerId = `${idPrefix}-answer-${index}`;

            if (!isPreviewMode) {
              // Editor: every answer is open, to edit it inline
              return (
                <div key={item.dataIndex} className="py-5 @tablet:py-6" style={{ borderColor: 'var(--theme-border)' }}>
                  <EditableText
                    blockId={blockId}
                    fieldKey={['questions', item.dataIndex, 'question']}
                    value={item.question}
                    as="h3"
                    className="font-semibold mb-2 text-base @tablet:text-lg"
                    style={{ color: 'var(--theme-text)' }}
                  />
                  <EditableText
                    blockId={blockId}
                    fieldKey={['questions', item.dataIndex, 'answer']}
                    value={item.answer}
                    as="p"
                    multiline
                    className="leading-relaxed text-sm @tablet:text-base"
                    style={{ color: 'var(--theme-text-muted)' }}
                  />
                </div>
              );
            }

            return (
              <div key={item.dataIndex} style={{ borderColor: 'var(--theme-border)' }}>
                {/* The whole row is the button: a tall touch target (QA-094) */}
                <h3 className="m-0">
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    className="w-full min-h-11 py-5 @tablet:py-6 flex items-center justify-between text-left font-semibold text-base @tablet:text-lg"
                    style={{ color: 'var(--theme-text)' }}
                  >
                    <span>{item.question}</span>
                    <ChevronDown
                      aria-hidden="true"
                      className={`w-5 h-5 shrink-0 ml-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      style={{ color: 'var(--theme-text-muted)' }}
                    />
                  </button>
                </h3>
                {/* Every answer is in the HTML (search engines, no JavaScript); closed ones are hidden (QA-050) */}
                <div id={answerId} hidden={!isOpen} className="pb-5 @tablet:pb-6">
                  <EditableText
                    blockId={blockId}
                    fieldKey={['questions', item.dataIndex, 'answer']}
                    value={item.answer}
                    as="p"
                    multiline
                    className="leading-relaxed text-sm @tablet:text-base"
                    style={{ color: 'var(--theme-text-muted)' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
