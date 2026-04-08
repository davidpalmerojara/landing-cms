'use client';

import { Image as ImageIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps } from '@/types/blocks';
import EditableText from './EditableText';

const IMAGE_KEYS = ['image1', 'image2', 'image3', 'image4', 'image5', 'image6'] as const;

export default function GalleryBlock({ blockId, data, isMobile, isTablet, isPreviewMode }: BlockProps) {
  const t = useTranslations('blocks');
  const columns = (data.columns as string) || '3';
  const colsClass =
    columns === '2'
      ? 'grid-cols-2'
      : columns === '4'
        ? isMobile ? 'grid-cols-2' : isTablet ? 'grid-cols-3' : 'grid-cols-4'
        : isMobile ? 'grid-cols-2' : 'grid-cols-3';

  const itemCount = parseInt(columns, 10) * 2;

  return (
    <section
      aria-label={t('galleryAria')}
      className={`transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } ${isMobile ? 'py-16 px-6' : 'py-24 px-8'}`}
      style={{ backgroundColor: 'var(--theme-bg)' }}
    >
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
        className="text-center mb-12 max-w-2xl mx-auto"
        style={{ color: 'var(--theme-text-muted)' }}
      />

      <div className={`grid ${colsClass} gap-4 max-w-5xl mx-auto`}>
        {Array.from({ length: itemCount }).map((_, i) => {
          const imageUrl = data[IMAGE_KEYS[i]] as string | undefined;
          return (
            <div
              key={i}
              className="aspect-[4/3] rounded-xl border overflow-hidden flex items-center justify-center hover:opacity-80 transition-colors"
              style={{ backgroundColor: 'var(--theme-surface)', borderColor: 'var(--theme-border)' }}
            >
              {imageUrl ? (
                <img src={imageUrl} alt={t('galleryImageAlt', { index: i + 1 })} className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="w-8 h-8" style={{ color: 'var(--theme-text-muted)', opacity: 0.4 }} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
