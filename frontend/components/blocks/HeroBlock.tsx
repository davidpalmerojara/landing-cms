'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps } from '@/types/blocks';
import EditableText from './EditableText';

export default function HeroBlock({ blockId, data, isMobile, isTablet, isPreviewMode }: BlockProps) {
  const t = useTranslations('blocks');
  const bgImage = data.backgroundImage as string;
  const alignment = (data.alignment as string) || 'center';
  const isLeft = alignment === 'left';

  return (
    <section
      aria-label={t('heroAria')}
      className={`relative flex flex-col transition-all ${
        isLeft ? 'items-start' : 'items-center'
      } justify-center ${
        isPreviewMode ? '' : 'pointer-events-none'
      } ${isMobile ? 'py-16 px-6' : 'py-32 px-8'}`}
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
        <div
          className={`relative z-10 inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium mb-8 backdrop-blur-sm`}
          style={{
            backgroundColor: bgImage ? 'rgba(255,255,255,0.15)' : 'var(--theme-surface)',
            color: bgImage ? '#fff' : 'var(--theme-text-muted)',
          }}
        >
          <Sparkles className="w-4 h-4" /> {(data.badgeText as string) || t('heroBadgeDefault')}
        </div>
        <EditableText
          blockId={blockId}
          fieldKey="title"
          value={data.title as string}
          as="h1"
          className={`relative z-10 tracking-tight mb-8 max-w-4xl leading-tight transition-all ${
            isLeft ? 'text-left' : 'text-center'
          } ${isMobile ? 'text-4xl' : isTablet ? 'text-5xl' : 'text-7xl'}`}
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
          value={data.subtitle as string}
          as="p"
          multiline
          className={`relative z-10 max-w-2xl mb-12 transition-all ${
            isLeft ? 'text-left' : 'text-center mx-auto'
          } ${isMobile ? 'text-lg' : 'text-xl'}`}
          style={{
            color: bgImage ? 'rgba(255,255,255,0.85)' : 'var(--theme-text-muted)',
            fontFamily: 'var(--bp-font-body)',
            lineHeight: 'var(--bp-line-height-body)',
          }}
        />
        <div
          className={`relative z-10 flex gap-4 transition-all ${
            isLeft ? 'justify-start' : 'w-full justify-center'
          } ${isMobile ? 'flex-col px-4' : 'flex-row items-center'}`}
        >
          <button
            className={`rounded-full font-medium shadow-xl transition-all hover:opacity-90 ${
              isMobile ? 'w-full py-4 text-lg' : 'px-8 py-4'
            }`}
            style={{
              backgroundColor: 'var(--theme-primary)',
              color: '#fff',
            }}
          >
            <EditableText blockId={blockId} fieldKey="buttonText" value={data.buttonText as string} />
          </button>
          <button
            className={`rounded-full font-medium border transition-all hover:opacity-80 ${
              isMobile ? 'w-full py-4 text-lg' : 'px-8 py-4'
            }`}
            style={{
              backgroundColor: bgImage ? 'transparent' : 'var(--theme-bg)',
              color: bgImage ? '#fff' : 'var(--theme-text)',
              borderColor: bgImage ? 'rgba(255,255,255,0.3)' : 'var(--theme-border)',
            }}
          >
            {(data.secondaryButtonText as string) || t('heroSecondaryAction')}
          </button>
        </div>
      </div>
    </section>
  );
}
