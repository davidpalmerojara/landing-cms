import type { BlockProps } from '@/types/blocks';

export default function CtaBlock({ data, isMobile, isPreviewMode }: BlockProps) {
  return (
    <div
      className={`bg-indigo-600 text-center transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } ${isMobile ? 'py-16 px-6' : 'py-24 px-8'}`}
    >
      <div className="max-w-3xl mx-auto">
        <h2
          className={`font-bold text-white mb-8 leading-tight transition-all ${
            isMobile ? 'text-3xl' : 'text-4xl md:text-5xl'
          }`}
        >
          {data.title as string}
        </h2>
        <button
          className={`bg-white text-indigo-600 rounded-full font-bold shadow-xl shadow-black/10 transition-transform ${
            isMobile
              ? 'w-full py-4 text-base'
              : 'px-10 py-4 text-lg hover:scale-105'
          }`}
        >
          {data.buttonText as string}
        </button>
      </div>
    </div>
  );
}
