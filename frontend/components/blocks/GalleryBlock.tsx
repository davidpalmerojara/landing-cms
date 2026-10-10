'use client';

import { Image as ImageIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps, GalleryData } from '@/types/blocks';
import EditableText from './EditableText';
import BlockImage from './BlockImage';

const COLUMN_CLASSES: Record<GalleryData['columns'], string> = {
  '2': 'grid-cols-2',
  '3': 'grid-cols-2 @tablet:grid-cols-3',
  '4': 'grid-cols-2 @tablet:grid-cols-3 @desktop:grid-cols-4',
};

export default function GalleryBlock({ blockId, data, isPreviewMode }: BlockProps<GalleryData>) {
  const t = useTranslations('blocks');

  return (
    <section
      aria-label={t('galleryAria')}
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
        className="text-center mb-4 text-3xl @tablet:text-4xl"
        style={{ color: 'var(--theme-text)', fontFamily: 'var(--bp-font-heading)', fontWeight: 'var(--bp-font-weight-heading)' as unknown as number }}
      />
      <EditableText
        blockId={blockId}
        fieldKey="subtitle"
        value={data.subtitle}
        as="p"
        className="text-center mb-12 max-w-2xl mx-auto"
        style={{ color: 'var(--theme-text-muted)' }}
      />

      {data.images.length > 0 && (
        <div className={`grid ${COLUMN_CLASSES[data.columns]} gap-4 max-w-5xl mx-auto`}>
          {data.images.map((image, i) => (
            <div
              key={i}
              className="aspect-[4/3] rounded-xl border overflow-hidden flex items-center justify-center hover:opacity-80 transition-colors"
              style={{ backgroundColor: 'var(--theme-surface)', borderColor: 'var(--theme-border)' }}
            >
              {image.src ? (
                <BlockImage
                  src={image.src}
                  alt={image.alt || t('galleryImageAlt', { index: i + 1 })}
                  className="w-full h-full object-cover"
                  fallback={<ImageIcon aria-hidden="true" className="w-8 h-8" style={{ color: 'var(--theme-text-muted)', opacity: 0.4 }} />}
                />
              ) : (
                // Slot without an image yet: placeholder
                <ImageIcon aria-hidden="true" className="w-8 h-8" style={{ color: 'var(--theme-text-muted)', opacity: 0.4 }} />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
