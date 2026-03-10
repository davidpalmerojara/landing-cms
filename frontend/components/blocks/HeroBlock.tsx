import { Sparkles } from 'lucide-react';
import type { BlockProps } from '@/types/blocks';

export default function HeroBlock({ data, isMobile, isTablet, isPreviewMode }: BlockProps) {
  return (
    <div
      className={`bg-white flex flex-col items-center justify-center transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } ${isMobile ? 'py-16 px-6' : 'py-32 px-8'}`}
    >
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100 text-zinc-600 text-sm font-medium mb-8">
        <Sparkles className="w-4 h-4" /> Nuevo Editor UI
      </div>
      <h1
        className={`font-bold tracking-tight text-zinc-900 mb-8 max-w-4xl leading-tight transition-all text-center ${
          isMobile ? 'text-4xl' : isTablet ? 'text-5xl' : 'text-7xl'
        }`}
      >
        {data.title as string}
      </h1>
      <p
        className={`text-zinc-500 max-w-2xl mx-auto mb-12 leading-relaxed text-center transition-all ${
          isMobile ? 'text-lg' : 'text-xl'
        }`}
      >
        {data.subtitle as string}
      </p>
      <div
        className={`flex gap-4 w-full justify-center transition-all ${
          isMobile ? 'flex-col px-4' : 'flex-row items-center'
        }`}
      >
        <button
          className={`bg-zinc-900 text-white rounded-full font-medium shadow-xl shadow-zinc-900/20 hover:bg-zinc-800 transition-all ${
            isMobile ? 'w-full py-4 text-lg' : 'px-8 py-4'
          }`}
        >
          {data.buttonText as string}
        </button>
        <button
          className={`bg-white text-zinc-900 rounded-full font-medium border border-zinc-200 hover:bg-zinc-50 transition-all ${
            isMobile ? 'w-full py-4 text-lg' : 'px-8 py-4'
          }`}
        >
          Saber más
        </button>
      </div>
    </div>
  );
}
