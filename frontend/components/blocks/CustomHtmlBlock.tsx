'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Code2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps } from '@/types/blocks';

/**
 * Sandbox for user HTML. No allow-scripts: nothing in the block can run
 * JavaScript, inline handlers (onerror=...) included. allow-same-origin is
 * safe without scripts and lets the page read the content height to size the
 * frame. Popups let links open in a new tab, outside the sandbox.
 */
export const CUSTOM_HTML_SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox';

function documentFor(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">` +
    `<style>html,body{margin:0}body{font-family:system-ui,sans-serif}img{max-width:100%;height:auto}</style>` +
    `</head><body>${html}</body></html>`;
}

function SandboxedHtml({ html, title }: { html: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);

  const measure = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (doc) setHeight(doc.documentElement.scrollHeight);
  }, []);

  const handleLoad = useCallback(() => {
    measure();
    // Images inside the frame can load later and change its height
    frameRef.current?.contentDocument?.addEventListener('load', measure, true);
  }, [measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <iframe
      ref={frameRef}
      sandbox={CUSTOM_HTML_SANDBOX}
      srcDoc={documentFor(html)}
      title={title}
      onLoad={handleLoad}
      className="block w-full border-0"
      style={{ height }}
    />
  );
}

export default function CustomHtmlBlock({ data, isPreviewMode }: BlockProps) {
  const t = useTranslations('blocks');
  const html = (data.html as string) || '';

  if (isPreviewMode && html) {
    return <SandboxedHtml html={html} title={t('customHtmlPreview')} />;
  }

  return (
    <div className="bg-zinc-50 py-12 px-8 pointer-events-none">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Code2 className="w-5 h-5 text-muted" />
          <span className="text-sm font-medium text-secondary">{t('customHtmlTitle')}</span>
        </div>
        <div className="bg-surface-elevated rounded-lg p-4 border border-subtle">
          <pre className="text-[12px] text-muted font-mono whitespace-pre-wrap break-all max-h-40 overflow-hidden">
            {html || t('customHtmlEmpty')}
          </pre>
        </div>
      </div>
    </div>
  );
}
