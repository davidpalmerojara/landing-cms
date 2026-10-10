import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { vi } from 'vitest';
import { useEditorStore } from '@/store/editor-store';
import { MESSAGES, type AppLocale } from '@/lib/i18n';
import { defaultBlockStyles, type Block, type BlockType } from '@/types/blocks';
import { makeBlock as buildBlock } from '@/lib/block-data';
import { defaultSeoFields, type Page } from '@/types/page';
import { cloneDesignTokens, defaultDesignTokens } from '@/lib/design-tokens';

export type RenderResult = {
  container: HTMLDivElement;
  rerender: (ui: ReactElement) => void;
  unmount: () => void;
};

function IntlWrapper({ children, locale }: { children: React.ReactNode; locale: AppLocale }) {
  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {children}
    </NextIntlClientProvider>
  );
}

export function render(ui: ReactElement, locale: AppLocale = 'es'): RenderResult {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<IntlWrapper locale={locale}>{ui}</IntlWrapper>);
  });

  return {
    container,
    rerender(nextUi: ReactElement) {
      act(() => {
        root.render(<IntlWrapper locale={locale}>{nextUi}</IntlWrapper>);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/** A block of `type` with `data` normalized (missing keys empty). */
export function makeBlock(
  type: BlockType,
  data: Record<string, unknown> = {},
  overrides: Partial<Pick<Block, 'id' | 'name'>> = {},
): Block {
  return buildBlock(
    {
      id: overrides.id ?? `blk_${Math.random().toString(36).slice(2, 9)}`,
      name: overrides.name || type,
      styles: { ...defaultBlockStyles },
    },
    type,
    data,
  );
}

export function makePage(blocks: Block[] = [], overrides: Partial<Page> = {}): Page {
  return {
    id: 'page-123',
    name: 'Test Page',
    status: 'draft',
    slug: 'test-page',
    designTokens: cloneDesignTokens(defaultDesignTokens),
    seo: { ...defaultSeoFields },
    blocks,
    ...overrides,
  };
}

export function resetEditorStore(page: Page = makePage()) {
  useEditorStore.setState({
    ...useEditorStore.getInitialState(),
    page,
    past: [],
    future: [],
    selectedBlockId: null,
    clipboard: null,
    isPreviewMode: false,
    isQuickEditMode: false,
    deviceMode: 'desktop',
    isSaved: false,
    autoSaveStatus: 'idle',
    pendingDeleteBlockId: null,
    isDragging: false,
    dragSource: null,
    canvasDropIndex: null,
    layerDropIndex: null,
    interactionState: {
      isPanning: false,
      isSpacePressed: false,
      isMiddleClickPanning: false,
    },
    viewportState: { zoom: 1, x: 0, y: 0 },
    toasts: [],
  }, true);
}

export interface FakeViewport {
  width: number;
  height: number;
  pointer: 'fine' | 'coarse';
}

/** Whether `query` matches `viewport`: comma-separated alternatives of `and`-joined width, height and pointer features. */
export function evaluateMediaQuery(query: string, viewport: FakeViewport): boolean {
  return query.split(',').some((alternative) =>
    alternative.split(/\band\b/).every((part) => {
      const match = /\(\s*([a-z-]+)\s*:\s*([a-z0-9.]+)\s*\)/.exec(part.trim());
      if (!match) return true;
      const [, feature, raw] = match;
      const px = parseFloat(raw);
      switch (feature) {
        case 'max-width': return viewport.width <= px;
        case 'min-width': return viewport.width >= px;
        case 'max-height': return viewport.height <= px;
        case 'min-height': return viewport.height >= px;
        case 'pointer': return viewport.pointer === raw;
        default: return false;
      }
    }),
  );
}

/**
 * A fake `window.matchMedia` that evaluates queries against a viewport the
 * test controls (width, height, pointer), and notifies listeners on change.
 */
export function installMatchMedia(initialWidth: number, initial: Partial<Omit<FakeViewport, 'width'>> = {}) {
  let viewport: FakeViewport = { width: initialWidth, height: initial.height ?? 900, pointer: initial.pointer ?? 'fine' };
  const lists: { query: string; listeners: Set<(event: MediaQueryListEvent) => void> }[] = [];

  const matchMedia = (query: string): MediaQueryList => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    lists.push({ query, listeners });
    return {
      media: query,
      get matches() { return evaluateMediaQuery(query, viewport); },
      onchange: null,
      addEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
        if (typeof listener === 'function') listeners.add(listener as (event: MediaQueryListEvent) => void);
      },
      removeEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
        if (typeof listener === 'function') listeners.delete(listener as (event: MediaQueryListEvent) => void);
      },
      addListener(listener: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null) {
        if (listener) listeners.add(listener as (event: MediaQueryListEvent) => void);
      },
      removeListener(listener: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null) {
        if (listener) listeners.delete(listener as (event: MediaQueryListEvent) => void);
      },
      dispatchEvent: () => true,
    };
  };

  vi.stubGlobal('matchMedia', vi.fn(matchMedia));

  const setViewport = (next: Partial<FakeViewport>) => {
    viewport = { ...viewport, ...next };
    act(() => {
      lists.forEach(({ query, listeners }) => {
        const event = { matches: evaluateMediaQuery(query, viewport), media: query } as MediaQueryListEvent;
        listeners.forEach((listener) => listener(event));
      });
    });
  };

  return {
    setWidth(nextWidth: number) {
      setViewport({ width: nextWidth });
    },
    setViewport,
    restore() {
      vi.unstubAllGlobals();
    },
  };
}

export function setNavigatorOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: online,
  });
}

export function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

export function keyDown(target: Document | HTMLElement, key: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}
