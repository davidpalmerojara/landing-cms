'use client';

import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps } from '@/types/blocks';
import EditableText from './EditableText';

export default function ContactBlock({ blockId, data, isMobile, isPreviewMode }: BlockProps) {
  const t = useTranslations('blocks');
  return (
    <section
      aria-label={t('contactAria')}
      className={`transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } ${isMobile ? 'py-16 px-6' : 'py-24 px-8'}`}
      style={{ backgroundColor: 'var(--theme-surface)' }}
    >
      <div className="max-w-xl mx-auto">
        <EditableText
          blockId={blockId}
          fieldKey="title"
          value={data.title as string}
          as="h2"
          className={`text-center mb-4 ${
            isMobile ? 'text-3xl' : 'text-4xl'
          }`}
          style={{ color: 'var(--theme-text)', fontFamily: 'var(--bp-font-heading)', fontWeight: 'var(--bp-font-weight-heading)' as unknown as number }}
        />
        <EditableText
          blockId={blockId}
          fieldKey="subtitle"
          value={data.subtitle as string}
          as="p"
          className="text-center mb-10"
          style={{ color: 'var(--theme-text-muted)' }}
        />

        <div className="space-y-4">
          <div className={`${isMobile ? 'space-y-4' : 'grid grid-cols-2 gap-4'}`}>
            <div>
              <label htmlFor={`${blockId}-name`} className="sr-only">{t('contactName')}</label>
              <input
                id={`${blockId}-name`}
                type="text"
                placeholder={(data.namePlaceholder as string) || t('contactName')}
                readOnly
                className="w-full px-4 py-3 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
              />
            </div>
            <div>
              <label htmlFor={`${blockId}-email`} className="sr-only">{t('contactEmail')}</label>
              <input
                id={`${blockId}-email`}
                type="email"
                placeholder={(data.emailPlaceholder as string) || t('contactEmail')}
                readOnly
                className="w-full px-4 py-3 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
              />
            </div>
          </div>
          <div>
            <label htmlFor={`${blockId}-message`} className="sr-only">{t('contactMessage')}</label>
            <textarea
              id={`${blockId}-message`}
              placeholder={(data.messagePlaceholder as string) || t('contactMessagePlaceholder')}
              readOnly
              className="w-full px-4 py-3 rounded-lg text-sm h-32 resize-none"
              style={{ backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
            />
          </div>
          <button
            className="w-full py-3 text-white rounded-lg font-medium hover:opacity-90 transition-colors flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--theme-primary)' }}
          >
            <Send className="w-4 h-4" />
            <EditableText blockId={blockId} fieldKey="buttonText" value={data.buttonText as string} />
          </button>
        </div>
      </div>
    </section>
  );
}
