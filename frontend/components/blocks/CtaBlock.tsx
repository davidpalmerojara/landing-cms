'use client';

import { useTranslations } from 'next-intl';
import type { BlockProps, CtaData } from '@/types/blocks';
import EditableText from './EditableText';
import BlockLink from './BlockLink';
import { safeHref } from '@/lib/safe-link';

export default function CtaBlock({ blockId, data, isPreviewMode }: BlockProps<CtaData>) {
  const t = useTranslations('blocks');
  const subtitle = data.subtitle;
  const buttonHref = isPreviewMode ? safeHref(data.buttonLink) : null;
  const buttonClass = `rounded-full font-bold shadow-xl shadow-black/10 transition-transform w-full py-4 text-base @tablet:w-auto @tablet:px-10 @tablet:text-lg @tablet:hover:scale-105`;
  const buttonStyle = { backgroundColor: 'var(--theme-bg)', color: 'var(--theme-primary)' };

  return (
    <section
      aria-label={t('ctaAria')}
      className={`text-center transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } py-16 px-6 @tablet:py-24 @tablet:px-8`}
      style={{ backgroundColor: 'var(--theme-primary)' }}
    >
      <div className="max-w-3xl mx-auto">
        <EditableText
          blockId={blockId}
          fieldKey="title"
          value={data.title}
          as="h2"
          className="text-white mb-4 leading-tight transition-all text-3xl @tablet:text-5xl"
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
            className="text-white/80 mb-8 leading-relaxed mx-auto max-w-xl text-base @tablet:text-xl"
          />
        )}
        <div className={subtitle ? '' : 'mt-8'}>
          {buttonHref ? (
            <BlockLink href={buttonHref} className={`${buttonClass} inline-block text-center`} style={buttonStyle}>
              <EditableText blockId={blockId} fieldKey="buttonText" value={data.buttonText} />
            </BlockLink>
          ) : (
            <button className={buttonClass} style={buttonStyle}>
              <EditableText blockId={blockId} fieldKey="buttonText" value={data.buttonText} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
