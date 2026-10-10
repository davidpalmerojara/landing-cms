'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Code2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps, CustomHtmlData } from '@/types/blocks';

/**
 * Sandbox for user HTML. No allow-scripts: nothing in the block can run
 * JavaScript, inline handlers (onerror=...) included. allow-same-origin is
 * safe without scripts and lets the page read the content height to size the
 * frame. Popups let links open in a new tab, outside the sandbox.
 */
export const CUSTOM_HTML_SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox';

/** Height of the frame before it can be measured (server HTML, no JavaScript): enough to show something. */
export const CUSTOM_HTML_INITIAL_HEIGHT = 150;

function documentFor(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">` +
    `<style>html,body{margin:0;background:transparent}body{display:flow-root;font-family:system-ui,sans-serif}img{max-width:100%;height:auto}</style>` +
    `</head><body>${html}</body></html>`;
}

/**
 * The frame's document can't read the page's CSS variables, so the page hands
 * it the theme's text and link colors and font (QA-080). Same origin, no scripts
 * inside: only the page writes these styles.
 */
function applyPageTheme(frame: HTMLIFrameElement, doc: Document) {
  const page = getComputedStyle(frame);
  const text = page.getPropertyValue('--theme-text').trim();
  const link = page.getPropertyValue('--theme-primary-text').trim();
  const body = doc.body;
  if (!body) return;
  if (text) body.style.color = text;
  body.style.fontFamily = page.fontFamily;
  if (link) {
    let style = doc.getElementById('paxl-theme');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'paxl-theme';
      doc.head.appendChild(style);
    }
    style.textContent = `a{color:${link}}`;
  }
}

function SandboxedHtml({ html, title }: { html: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  const measure = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    // The height of the content, not of the frame (scrollHeight never goes below the frame height)
    if (doc?.documentElement) setHeight(Math.ceil(doc.documentElement.getBoundingClientRect().height));
  }, []);

  const handleLoad = useCallback(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc) return;
    applyPageTheme(frame, doc);
    measure();
    // Images inside the frame can load later and change its height
    doc.addEventListener('load', measure, true);
  }, [measure]);

  // The server-rendered frame often finishes loading before React attaches onLoad,
  // and React never fires it for a frame that already loaded: check on mount (QA-010)
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.readyState === 'complete' && doc.body) handleLoad();
  }, [handleLoad]);

  // A narrower frame (window or editor device switch) makes the content taller
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <iframe
      ref={frameRef}
      sandbox={CUSTOM_HTML_SANDBOX}
      srcDoc={documentFor(html)}
      title={title}
      onLoad={handleLoad}
      className="block w-full border-0"
      style={{ height: height ?? CUSTOM_HTML_INITIAL_HEIGHT }}
    />
  );
}

export default function CustomHtmlBlock({ data, isPreviewMode }: BlockProps<CustomHtmlData>) {
  const t = useTranslations('blocks');
  const html = data.html;

  if (isPreviewMode) {
    // Nothing written yet: visitors see nothing, not the editor's placeholder (QA-042)
    if (!html.trim()) return null;
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
