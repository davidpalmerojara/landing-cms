import { Image as ImageIcon } from 'lucide-react';
import type { BlockProps } from '@/types/blocks';

export default function GalleryBlock({ data, isMobile, isPreviewMode }: BlockProps) {
  const columns = (data.columns as string) || '3';
  const colsClass =
    columns === '2'
      ? 'grid-cols-2'
      : columns === '4'
        ? isMobile ? 'grid-cols-2' : 'grid-cols-4'
        : isMobile ? 'grid-cols-2' : 'grid-cols-3';

  const itemCount = parseInt(columns, 10) * 2;

  return (
    <div
      className={`bg-white transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } ${isMobile ? 'py-16 px-6' : 'py-24 px-8'}`}
    >
      <h2
        className={`font-bold text-center text-zinc-900 mb-4 ${
          isMobile ? 'text-3xl' : 'text-4xl'
        }`}
      >
        {data.title as string}
      </h2>
      <p className="text-zinc-500 text-center mb-12 max-w-2xl mx-auto">
        {data.subtitle as string}
      </p>

      <div className={`grid ${colsClass} gap-4 max-w-5xl mx-auto`}>
        {Array.from({ length: itemCount }).map((_, i) => (
          <div
            key={i}
            className="aspect-[4/3] rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center hover:bg-zinc-200/50 transition-colors"
          >
            <ImageIcon className="w-8 h-8 text-zinc-300" />
          </div>
        ))}
      </div>
    </div>
  );
}
