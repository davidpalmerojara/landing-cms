import type { BlockProps } from '@/types/blocks';

export default function FaqBlock({ data, isMobile, isPreviewMode }: BlockProps) {
  const questions = [
    { q: data.q1 as string, a: data.a1 as string },
    { q: data.q2 as string, a: data.a2 as string },
    { q: data.q3 as string, a: data.a3 as string },
  ].filter((item) => item.q);

  return (
    <div
      className={`bg-white transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } ${isMobile ? 'py-16 px-6' : 'py-24 px-8'}`}
    >
      <h2
        className={`font-bold text-center text-zinc-900 mb-12 ${
          isMobile ? 'text-3xl' : 'text-4xl'
        }`}
      >
        {data.title as string}
      </h2>

      <div className="max-w-3xl mx-auto divide-y divide-zinc-200">
        {questions.map((item, i) => (
          <div key={i} className={`${isMobile ? 'py-5' : 'py-6'}`}>
            <h3 className={`font-semibold text-zinc-900 mb-2 ${isMobile ? 'text-base' : 'text-lg'}`}>
              {item.q}
            </h3>
            <p className={`text-zinc-500 leading-relaxed ${isMobile ? 'text-sm' : 'text-base'}`}>
              {item.a}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
