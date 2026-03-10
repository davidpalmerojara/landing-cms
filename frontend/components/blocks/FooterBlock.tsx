import { Sparkles } from 'lucide-react';
import type { BlockProps } from '@/types/blocks';

export default function FooterBlock({ data, isMobile, isPreviewMode }: BlockProps) {
  return (
    <footer
      className={`bg-zinc-950 text-zinc-400 transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } ${isMobile ? 'py-12 px-6' : 'py-16 px-8'}`}
    >
      <div
        className={`max-w-5xl mx-auto flex transition-all ${
          isMobile ? 'flex-col gap-8 text-center' : 'flex-row justify-between items-center'
        } mb-12`}
      >
        <div className={isMobile ? 'w-full' : 'max-w-sm'}>
          <div className="flex items-center justify-center md:justify-start gap-2 mb-4">
            <div className="w-6 h-6 rounded bg-indigo-500 flex items-center justify-center text-white">
              <Sparkles className="w-3 h-3" />
            </div>
            <h3 className="text-xl font-bold text-white tracking-wide">
              {data.brandName as string}
            </h3>
          </div>
          <p className="text-zinc-500 leading-relaxed text-sm">
            {data.description as string}
          </p>
        </div>
        <div
          className={`flex gap-6 ${
            isMobile ? 'justify-center w-full flex-wrap' : ''
          }`}
        >
          <span className="hover:text-white cursor-pointer transition-colors text-sm font-medium">
            {data.link1Label as string}
          </span>
          <span className="hover:text-white cursor-pointer transition-colors text-sm font-medium">
            {data.link2Label as string}
          </span>
          <span className="hover:text-white cursor-pointer transition-colors text-sm font-medium">
            {data.link3Label as string}
          </span>
        </div>
      </div>
      <div className="max-w-5xl mx-auto pt-8 border-t border-zinc-800/50 text-sm text-center text-zinc-600">
        {data.copyright as string}
      </div>
    </footer>
  );
}
