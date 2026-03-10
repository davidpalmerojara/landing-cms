import { Check } from 'lucide-react';
import type { BlockProps } from '@/types/blocks';

export default function PricingBlock({ data, isMobile, isPreviewMode }: BlockProps) {
  const plan1Features = ((data.plan1Features as string) || '').split('\n').filter(Boolean);
  const plan2Features = ((data.plan2Features as string) || '').split('\n').filter(Boolean);
  const isHighlighted = data.plan2Highlighted as boolean;

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

      <div
        className={`grid gap-6 max-w-4xl mx-auto ${
          isMobile ? 'grid-cols-1' : 'grid-cols-2'
        }`}
      >
        {/* Plan 1 */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-8 flex flex-col">
          <h3 className="text-lg font-semibold text-zinc-900">{data.plan1Name as string}</h3>
          <div className="mt-4 mb-6">
            <span className="text-4xl font-bold text-zinc-900">{data.plan1Price as string}</span>
            <span className="text-zinc-500 ml-1">/mes</span>
          </div>
          <ul className="space-y-3 mb-8 flex-1">
            {plan1Features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-zinc-600 text-sm">
                <Check className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <button className="w-full py-3 rounded-lg border border-zinc-300 text-zinc-700 font-medium hover:bg-zinc-50 transition-colors">
            {data.plan1ButtonText as string}
          </button>
        </div>

        {/* Plan 2 */}
        <div
          className={`rounded-2xl p-8 flex flex-col ${
            isHighlighted
              ? 'bg-zinc-900 text-white border-2 border-indigo-500 shadow-lg shadow-indigo-500/10'
              : 'bg-white border border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <h3 className={`text-lg font-semibold ${isHighlighted ? 'text-white' : 'text-zinc-900'}`}>
              {data.plan2Name as string}
            </h3>
            {isHighlighted && (
              <span className="text-[10px] bg-indigo-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">
                Popular
              </span>
            )}
          </div>
          <div className="mt-4 mb-6">
            <span className={`text-4xl font-bold ${isHighlighted ? 'text-white' : 'text-zinc-900'}`}>
              {data.plan2Price as string}
            </span>
            <span className={`ml-1 ${isHighlighted ? 'text-zinc-400' : 'text-zinc-500'}`}>/mes</span>
          </div>
          <ul className="space-y-3 mb-8 flex-1">
            {plan2Features.map((f, i) => (
              <li
                key={i}
                className={`flex items-start gap-2 text-sm ${
                  isHighlighted ? 'text-zinc-300' : 'text-zinc-600'
                }`}
              >
                <Check
                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                    isHighlighted ? 'text-indigo-400' : 'text-zinc-400'
                  }`}
                />
                {f}
              </li>
            ))}
          </ul>
          <button
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              isHighlighted
                ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                : 'border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            {data.plan2ButtonText as string}
          </button>
        </div>
      </div>
    </div>
  );
}
