import type { BlockProps } from '@/types/blocks';

export default function LogoCloudBlock({ data, isMobile, isPreviewMode }: BlockProps) {
  const logos = [
    data.logo1 as string,
    data.logo2 as string,
    data.logo3 as string,
    data.logo4 as string,
    data.logo5 as string,
  ].filter(Boolean);

  return (
    <div
      className={`bg-zinc-50 transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } ${isMobile ? 'py-12 px-6' : 'py-16 px-8'}`}
    >
      <p className="text-center text-sm text-zinc-500 mb-8 uppercase tracking-widest font-medium">
        {data.title as string}
      </p>
      <div
        className={`flex items-center justify-center gap-8 max-w-4xl mx-auto flex-wrap ${
          isMobile ? 'gap-6' : 'gap-12'
        }`}
      >
        {logos.map((name, i) => (
          <span
            key={i}
            className={`font-bold text-zinc-400 opacity-60 select-none ${
              isMobile ? 'text-lg' : 'text-xl'
            }`}
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
