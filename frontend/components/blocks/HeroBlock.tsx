'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps, HeroData } from '@/types/blocks';
import EditableText from './EditableText';
import BlockLink from './BlockLink';
import { safeHref } from '@/lib/safe-link';

export default function HeroBlock({ blockId, data, isPreviewMode }: BlockProps<HeroData>) {
  const t = useTranslations('blocks');
  const bgImage = data.backgroundImage;
  const alignment = data.alignment;
  // Optional: an empty field hides the element (no placeholder text on real pages)
  const badgeText = data.badgeText.trim();
  const secondaryButtonText = data.secondaryButtonText.trim();
  const isLeft = alignment === 'left';
  const buttonHref = isPreviewMode ? safeHref(data.buttonLink) : null;
  const secondaryButtonHref = isPreviewMode ? safeHref(data.secondaryButtonLink) : null;
  const primaryButtonClass = `rounded-full font-medium shadow-xl transition-all hover:opacity-90 w-full py-4 text-lg @tablet:w-auto @tablet:px-8 @tablet:text-base`;
  const primaryButtonStyle = { backgroundColor: 'var(--theme-primary)', color: '#fff' };
  const secondaryButtonClass = `rounded-full font-medium border transition-all hover:opacity-80 w-full py-4 text-lg @tablet:w-auto @tablet:px-8 @tablet:text-base`;
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
        backgroundColor: bgImage ? undefined : 'var(--theme-bg)',
        ...(bgImage ? {
          backgroundImage: `url(${bgImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : {}),
      }}
    >
      {bgImage && (
        <div className="absolute inset-0 bg-black/50" />
      )}
      <div className={`${isLeft ? 'max-w-5xl mx-auto w-full' : ''}`}>
        {badgeText && (
          <div
            className="relative z-10 inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium mb-8 backdrop-blur-sm"
            style={{
              backgroundColor: bgImage ? 'rgba(255,255,255,0.15)' : 'var(--theme-surface)',
              color: bgImage ? '#fff' : 'var(--theme-text-muted)',
            }}
          >
            <Sparkles className="w-4 h-4" /> {badgeText}
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
            color: bgImage ? 'rgba(255,255,255,0.85)' : 'var(--theme-text-muted)',
            fontFamily: 'var(--bp-font-body)',
            lineHeight: 'var(--bp-line-height-body)',
          }}
        />
        <div
          className={`relative z-10 flex gap-4 transition-all ${
            isLeft ? 'justify-start' : 'w-full justify-center'
          } flex-col px-4 @tablet:flex-row @tablet:items-center @tablet:px-0`}
        >
          {buttonHref ? (
            <BlockLink href={buttonHref} className={`${primaryButtonClass} inline-block text-center`} style={primaryButtonStyle}>
              <EditableText blockId={blockId} fieldKey="buttonText" value={data.buttonText} />
            </BlockLink>
          ) : (
            <button className={primaryButtonClass} style={primaryButtonStyle}>
              <EditableText blockId={blockId} fieldKey="buttonText" value={data.buttonText} />
            </button>
          )}
          {secondaryButtonText && (secondaryButtonHref ? (
            <BlockLink href={secondaryButtonHref} className={`${secondaryButtonClass} inline-block text-center`} style={secondaryButtonStyle}>
              {secondaryButtonText}
            </BlockLink>
          ) : (
            <button className={secondaryButtonClass} style={secondaryButtonStyle}>
              {secondaryButtonText}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
