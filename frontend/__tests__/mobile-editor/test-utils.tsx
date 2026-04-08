import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { vi } from 'vitest';
import { useEditorStore } from '@/store/editor-store';
import { MESSAGES } from '@/lib/i18n';
import { defaultBlockStyles, type Block } from '@/types/blocks';
import { defaultSeoFields, type Page } from '@/types/page';

export type RenderResult = {
  container: HTMLDivElement;
  rerender: (ui: ReactElement) => void;
  unmount: () => void;
};

function IntlWrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="es" messages={MESSAGES.es}>
      {children}
    </NextIntlClientProvider>
  );
}

export function render(ui: ReactElement): RenderResult {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<IntlWrapper>{ui}</IntlWrapper>);
  });

  return {
    container,
    rerender(nextUi: ReactElement) {
      act(() => {
        root.render(<IntlWrapper>{nextUi}</IntlWrapper>);
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

export function makeBlock(type: string, data: Record<string, unknown> = {}, overrides: Partial<Block> = {}): Block {
  return {
    id: `blk_${Math.random().toString(36).slice(2, 9)}`,
    type,
    name: overrides.name || type,
    data,
    styles: { ...defaultBlockStyles },
    ...overrides,
  };
}

export function makePage(blocks: Block[] = [], overrides: Partial<Page> = {}): Page {
  return {
    id: 'page-123',
    name: 'Test Page',
    status: 'draft',
    slug: 'test-page',
    themeId: 'default',
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

export function installMatchMedia(initialWidth: number) {
  let width = initialWidth;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  const mql = {
    media: `(max-width: ${768 - 1}px)`,
    get matches() { return width < 768; },
    onchange: null as ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null,
    addEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
      if (typeof listener === 'function') listeners.add(listener as (event: MediaQueryListEvent) => void);
    },
    removeEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
      if (typeof listener === 'function') listeners.delete(listener as (event: MediaQueryListEvent) => void);
    },
    addListener(listener: (event: MediaQueryListEvent) => void) {
      listeners.add(listener);
    },
    removeListener(listener: (event: MediaQueryListEvent) => void) {
      listeners.delete(listener);
    },
    dispatchEvent: () => true,
  } satisfies MediaQueryList;

  vi.stubGlobal('matchMedia', vi.fn(() => mql));

  return {
    setWidth(nextWidth: number) {
      width = nextWidth;
      const event = { matches: mql.matches, media: mql.media } as MediaQueryListEvent;
      act(() => {
        listeners.forEach((listener) => listener(event));
      });
    },
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
