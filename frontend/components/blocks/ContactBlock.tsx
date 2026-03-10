import { Send } from 'lucide-react';
import type { BlockProps } from '@/types/blocks';

export default function ContactBlock({ data, isMobile, isPreviewMode }: BlockProps) {
  return (
    <div
      className={`bg-zinc-50 transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } ${isMobile ? 'py-16 px-6' : 'py-24 px-8'}`}
    >
      <div className="max-w-xl mx-auto">
        <h2
          className={`font-bold text-center text-zinc-900 mb-4 ${
            isMobile ? 'text-3xl' : 'text-4xl'
          }`}
        >
          {data.title as string}
        </h2>
        <p className="text-zinc-500 text-center mb-10">
          {data.subtitle as string}
        </p>

        <div className="space-y-4">
          <div className={`${isMobile ? 'space-y-4' : 'grid grid-cols-2 gap-4'}`}>
            <input
              type="text"
              placeholder="Nombre"
              readOnly
              className="w-full px-4 py-3 rounded-lg bg-white border border-zinc-200 text-zinc-900 placeholder-zinc-400 text-sm"
            />
            <input
              type="email"
              placeholder="Email"
              readOnly
              className="w-full px-4 py-3 rounded-lg bg-white border border-zinc-200 text-zinc-900 placeholder-zinc-400 text-sm"
            />
          </div>
          <textarea
            placeholder="Tu mensaje..."
            readOnly
            className="w-full px-4 py-3 rounded-lg bg-white border border-zinc-200 text-zinc-900 placeholder-zinc-400 text-sm h-32 resize-none"
          />
          <button className="w-full py-3 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2">
            <Send className="w-4 h-4" />
            {data.buttonText as string}
          </button>
        </div>
      </div>
    </div>
  );
}
