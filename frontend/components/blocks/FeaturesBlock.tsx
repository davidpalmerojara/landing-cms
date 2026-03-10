import { Smartphone, Monitor } from 'lucide-react';
import type { BlockProps } from '@/types/blocks';

export default function FeaturesBlock({ data, isMobile, isPreviewMode }: BlockProps) {
  return (
    <div
      className={`bg-zinc-50 transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } ${isMobile ? 'py-16 px-6' : 'py-24 px-8'}`}
    >
      <h2
        className={`font-bold text-center text-zinc-900 mb-12 transition-all ${
          isMobile ? 'text-3xl' : 'text-4xl mb-16'
        }`}
      >
        {data.title as string}
      </h2>
      <div
        className={`grid gap-6 max-w-5xl mx-auto transition-all ${
          isMobile ? 'grid-cols-1' : 'grid-cols-2'
        }`}
      >
        <div
          className={`bg-white rounded-3xl shadow-sm border border-zinc-100 hover:shadow-md transition-all ${
            isMobile ? 'p-6' : 'p-10'
          }`}
        >
          <div
            className={`w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 ${
              isMobile ? 'mb-6 w-12 h-12' : 'mb-8'
            }`}
          >
            <Smartphone className={isMobile ? 'w-6 h-6' : 'w-7 h-7'} />
          </div>
          <h3
            className={`font-semibold mb-3 text-zinc-900 ${
              isMobile ? 'text-lg' : 'text-xl mb-4'
            }`}
          >
            {data.feature1Title as string}
          </h3>
          <p
            className={`text-zinc-500 leading-relaxed ${
              isMobile ? 'text-base' : 'text-lg'
            }`}
          >
            {data.feature1Desc as string}
          </p>
        </div>
        <div
          className={`bg-white rounded-3xl shadow-sm border border-zinc-100 hover:shadow-md transition-all ${
            isMobile ? 'p-6' : 'p-10'
          }`}
        >
          <div
            className={`w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 ${
              isMobile ? 'mb-6 w-12 h-12' : 'mb-8'
            }`}
          >
            <Monitor className={isMobile ? 'w-6 h-6' : 'w-7 h-7'} />
          </div>
          <h3
            className={`font-semibold mb-3 text-zinc-900 ${
              isMobile ? 'text-lg' : 'text-xl mb-4'
            }`}
          >
            {data.feature2Title as string}
          </h3>
          <p
            className={`text-zinc-500 leading-relaxed ${
              isMobile ? 'text-base' : 'text-lg'
            }`}
          >
            {data.feature2Desc as string}
          </p>
        </div>
      </div>
    </div>
  );
}
