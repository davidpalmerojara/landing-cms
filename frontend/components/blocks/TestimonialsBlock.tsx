import { Quote } from 'lucide-react';
import type { BlockProps } from '@/types/blocks';

export default function TestimonialsBlock({ data, isMobile, isPreviewMode }: BlockProps) {
  return (
    <div
      className={`bg-white transition-all ${
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
        {[1, 2].map((num) => (
          <div
            key={num}
            className="bg-zinc-50 p-8 rounded-3xl border border-zinc-100 relative hover:shadow-md transition-shadow"
          >
            <Quote className="w-8 h-8 text-indigo-200 mb-4" />
            <p
              className={`text-zinc-600 mb-8 leading-relaxed italic ${
                isMobile ? 'text-base' : 'text-lg'
              }`}
            >
              &ldquo;{data[`quote${num}`] as string}&rdquo;
            </p>
            <div className="flex items-center gap-4 mt-auto">
              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xl shrink-0">
                {(data[`author${num}`] as string)?.charAt(0) || '?'}
              </div>
              <div>
                <h4 className="font-semibold text-zinc-900">
                  {data[`author${num}`] as string}
                </h4>
                <p className="text-sm text-zinc-500">
                  {data[`role${num}`] as string}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
