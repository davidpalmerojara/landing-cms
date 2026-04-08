'use client';

import { useTranslations } from 'next-intl';
import type { BlockProps } from '@/types/blocks';
import EditableText from './EditableText';

export default function CtaBlock({ blockId, data, isMobile, isPreviewMode }: BlockProps) {
  const t = useTranslations('blocks');
  const subtitle = data.subtitle as string;

  return (
    <section
      aria-label={t('ctaAria')}
      className={`text-center transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } ${isMobile ? 'py-16 px-6' : 'py-24 px-8'}`}
      style={{ backgroundColor: 'var(--theme-primary)' }}
    >
      <div className="max-w-3xl mx-auto">
        <EditableText
          blockId={blockId}
          fieldKey="title"
          value={data.title as string}
          as="h2"
          className={`text-white mb-4 leading-tight transition-all ${
            isMobile ? 'text-3xl' : 'text-4xl md:text-5xl'
          }`}
          style={{
            fontFamily: 'var(--bp-font-heading)',
            fontWeight: 'var(--bp-font-weight-heading)' as unknown as number,
          }}
        />
        {subtitle && (
          <EditableText
            blockId={blockId}
            fieldKey="subtitle"
            value={subtitle}
            as="p"
            multiline
            className={`text-white/80 mb-8 leading-relaxed mx-auto max-w-xl ${
              isMobile ? 'text-base' : 'text-xl'
            }`}
          />
        )}
        <div className={subtitle ? '' : 'mt-8'}>
          <button
            className={`rounded-full font-bold shadow-xl shadow-black/10 transition-transform ${
              isMobile
                ? 'w-full py-4 text-base'
                : 'px-10 py-4 text-lg hover:scale-105'
            }`}
            style={{ backgroundColor: 'var(--theme-bg)', color: 'var(--theme-primary)' }}
          >
            <EditableText blockId={blockId} fieldKey="buttonText" value={data.buttonText as string} />
          </button>
        </div>
      </div>
    </section>
  );
}
