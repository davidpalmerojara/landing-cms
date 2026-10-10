'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps, HeroData } from '@/types/blocks';
import EditableText from './EditableText';
import BlockButton from './BlockButton';

/**
 * CSS `url()` for an image address. Quoted, so nothing in the value can close
 * the function and add declarations (QA-005; the server also refuses such URLs).
 */
export function cssUrl(src: string): string {
  return `url(${JSON.stringify(src)})`;
}

export default function HeroBlock({ blockId, data, isPreviewMode }: BlockProps<HeroData>) {
  const t = useTranslations('blocks');
  const bgImage = data.backgroundImage;
  const alignment = data.alignment;
  // Optional: an empty field hides the element (no placeholder text on real pages)
  const badgeText = data.badgeText.trim();
  const secondaryButtonText = data.secondaryButtonText.trim();
  // On the page a button without text is not shown (QA-040); the editor keeps it to type into
  const showPrimaryButton = !isPreviewMode || data.buttonText.trim() !== '';
  const isLeft = alignment === 'left';
  const primaryButtonClass = `rounded-full font-medium shadow-xl transition-all w-full py-4 text-lg @tablet:w-auto @tablet:px-8 @tablet:text-base`;
  const primaryButtonStyle = { backgroundColor: 'var(--theme-primary)', color: 'var(--theme-text-on-primary)' };
  const secondaryButtonClass = `rounded-full font-medium border transition-all w-full py-4 text-lg @tablet:w-auto @tablet:px-8 @tablet:text-base`;
  const secondaryButtonStyle = {
    backgroundColor: bgImage ? 'transparent' : 'var(--theme-bg)',
    color: bgImage ? '#fff' : 'var(--theme-text)',
    borderColor: bgImage ? 'rgba(255,255,255,0.3)' : 'var(--theme-border)',
  };

  return (
    <section
      aria-label={t('heroAria')}
      className={`relative flex flex-col transition-all ${
        isLeft ? 'items-start' : 'items-center'
      } justify-center ${
        isPreviewMode ? '' : 'pointer-events-none'
      } py-16 px-6 @tablet:py-32 @tablet:px-8`}
      style={{
        backgroundColor: bgImage ? undefined : 'var(--block-bg, var(--theme-bg))',
        ...(bgImage ? {
          backgroundImage: cssUrl(bgImage),
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : {}),
      }}
    >
      {/* Dark enough that white text reads at 4.5:1 even over a white photo */}
      {bgImage && (
        <div className="absolute inset-0 bg-black/60" />
      )}
      <div className={`${isLeft ? 'max-w-5xl mx-auto w-full' : 'w-full flex flex-col items-center'}`}>
        {badgeText && (
          <div
            className="relative z-10 inline-flex w-fit items-center gap-2 px-3 py-1 rounded-full text-sm font-medium mb-8 backdrop-blur-sm"
            style={{
              backgroundColor: bgImage ? 'rgba(0,0,0,0.3)' : 'var(--theme-surface)',
              color: bgImage ? '#fff' : 'var(--theme-text-muted)',
            }}
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" /> {badgeText}
          </div>
        )}
        <EditableText
          blockId={blockId}
          fieldKey="title"
          value={data.title}
          as="h1"
          className={`relative z-10 tracking-tight mb-8 max-w-4xl leading-tight transition-all ${
            isLeft ? 'text-left' : 'text-center'
          } text-4xl @tablet:text-5xl @desktop:text-7xl`}
          style={{
            color: bgImage ? '#fff' : 'var(--theme-text)',
            fontFamily: 'var(--bp-font-heading)',
            fontWeight: 'var(--bp-font-weight-heading)' as unknown as number,
            lineHeight: 'var(--bp-line-height-heading)',
          }}
        />
        <EditableText
          blockId={blockId}
          fieldKey="subtitle"
          value={data.subtitle}
          as="p"
          multiline
          className={`relative z-10 max-w-2xl mb-12 transition-all ${
            isLeft ? 'text-left' : 'text-center mx-auto'
          } text-lg @tablet:text-xl`}
          style={{
            color: bgImage ? 'rgba(255,255,255,0.9)' : 'var(--theme-text-muted)',
            fontFamily: 'var(--bp-font-body)',
            lineHeight: 'var(--bp-line-height-body)',
          }}
        />
        {(showPrimaryButton || secondaryButtonText) && (
          <div
            className={`relative z-10 flex gap-4 transition-all ${
              isLeft ? 'justify-start' : 'w-full justify-center'
            } flex-col px-4 @tablet:flex-row @tablet:items-center @tablet:px-0`}
          >
            {showPrimaryButton && (
              <BlockButton
                link={data.buttonLink}
                isPreviewMode={isPreviewMode}
                className={primaryButtonClass}
                interactiveClassName="hover:opacity-90"
                style={primaryButtonStyle}
              >
                <EditableText blockId={blockId} fieldKey="buttonText" value={data.buttonText} />
              </BlockButton>
            )}
            {secondaryButtonText && (
              <BlockButton
                link={data.secondaryButtonLink}
                isPreviewMode={isPreviewMode}
                className={secondaryButtonClass}
                interactiveClassName="hover:opacity-80"
                style={secondaryButtonStyle}
              >
                {secondaryButtonText}
              </BlockButton>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
