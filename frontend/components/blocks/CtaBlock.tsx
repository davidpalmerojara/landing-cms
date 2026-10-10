'use client';

import { useTranslations } from 'next-intl';
import type { BlockProps, CtaData } from '@/types/blocks';
import EditableText from './EditableText';
import BlockButton from './BlockButton';

export default function CtaBlock({ blockId, data, isPreviewMode }: BlockProps<CtaData>) {
  const t = useTranslations('blocks');
  const subtitle = data.subtitle;
  // On the page a button without text is not shown (QA-040)
  const showButton = !isPreviewMode || data.buttonText.trim() !== '';
  const buttonClass = `rounded-full font-bold shadow-xl shadow-black/10 transition-transform w-full py-4 text-base @tablet:w-auto @tablet:px-10 @tablet:text-lg`;
  // The page background with the primary color as text (adjusted to 4.5:1 against it)
  const buttonStyle = { backgroundColor: 'var(--theme-bg)', color: 'var(--theme-primary-text)' };

  return (
    <section
      aria-label={t('ctaAria')}
      className={`text-center transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } py-16 px-6 @tablet:py-24 @tablet:px-8`}
      style={{ backgroundColor: 'var(--block-bg, var(--theme-primary))' }}
    >
      <div className="max-w-3xl mx-auto">
        <EditableText
          blockId={blockId}
          fieldKey="title"
          value={data.title}
          as="h2"
          className="mb-4 leading-tight transition-all text-3xl @tablet:text-5xl"
          style={{
            color: 'var(--theme-text-on-primary)',
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
            className="mb-8 leading-relaxed mx-auto max-w-xl text-base @tablet:text-xl"
            style={{ color: 'var(--theme-text-on-primary-muted)' }}
          />
        )}
        {showButton && (
          <div className={subtitle ? '' : 'mt-8'}>
            <BlockButton
              link={data.buttonLink}
              isPreviewMode={isPreviewMode}
              className={buttonClass}
              interactiveClassName="@tablet:hover:scale-105"
              style={buttonStyle}
            >
              <EditableText blockId={blockId} fieldKey="buttonText" value={data.buttonText} />
            </BlockButton>
          </div>
        )}
      </div>
    </section>
  );
}
