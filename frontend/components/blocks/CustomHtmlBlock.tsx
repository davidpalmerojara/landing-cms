import { Code2 } from 'lucide-react';
import type { BlockProps } from '@/types/blocks';

export default function CustomHtmlBlock({ data, isPreviewMode }: BlockProps) {
  const html = (data.html as string) || '';

  if (isPreviewMode && html) {
    return (
      <div
        className="w-full"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div className="bg-zinc-50 py-12 px-8 pointer-events-none">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Code2 className="w-5 h-5 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-500">HTML Personalizado</span>
        </div>
        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
          <pre className="text-[12px] text-zinc-400 font-mono whitespace-pre-wrap break-all max-h-40 overflow-hidden">
            {html || '<!-- Escribe tu HTML en el inspector -->'}
          </pre>
        </div>
      </div>
    </div>
  );
}
