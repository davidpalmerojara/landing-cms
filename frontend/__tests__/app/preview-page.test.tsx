import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import PreviewPage from '@/app/preview/[pageId]/page';
import { api, type ApiPage } from '@/lib/api';
import { MESSAGES } from '@/lib/i18n';
import { render } from '../mobile-editor/test-utils';

vi.mock('next/navigation', () => ({ useParams: () => ({ pageId: 'page-1' }) }));

function apiPage(overrides: Partial<ApiPage> = {}): ApiPage {
  return {
    id: 'page-1', version: 1, name: 'Mi landing', slug: 'mi-landing', status: 'draft', design_tokens: {},
    blocks: [{
      id: '00000000-0000-4000-8000-000000000001', type: 'cta', order: 0,
      data: { title: 'Únete', buttonText: 'Suscribirse', buttonLink: '' }, styles: {}, created_at: '', updated_at: '',
    }],
    seo_title: '', seo_description: '', seo_canonical_url: '', og_title: '', og_description: '', og_image: '', og_type: 'website',
    noindex: false, language: 'en', created_at: '', updated_at: '',
    ...overrides,
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('preview page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.title = '';
  });

  it('names the page in the tab title and declares its language (QA-085, QA-091)', async () => {
    vi.spyOn(api.pages, 'get').mockResolvedValue(apiPage());
    const view = render(<PreviewPage />);
    await flush();

    expect(document.title).toContain('Mi landing');
    expect(document.documentElement.lang).toBe('en');
    expect(view.container.querySelector('main')?.getAttribute('lang')).toBe('en');
    view.unmount();
  });

  it('after publishing, links to the public page and says which buttons have no link (QA-098, D9)', async () => {
    vi.spyOn(api.pages, 'get').mockResolvedValue(apiPage());
    vi.spyOn(api.pages, 'publish').mockResolvedValue(apiPage({ status: 'published' }));
    const view = render(<PreviewPage />);
    await flush();

    const publish = Array.from(view.container.querySelectorAll('button')).find((b) => b.textContent === MESSAGES.es.preview.publish)!;
    await act(async () => {
      publish.click();
    });
    await flush();

    const link = view.container.querySelector<HTMLAnchorElement>('a[href="/p/mi-landing"]');
    expect(link).not.toBeNull();
    expect(view.container.querySelector('[role="note"]')?.textContent).toContain('“Suscribirse”');
    // Published and unchanged: the button now offers to publish changes
    expect(Array.from(view.container.querySelectorAll('button')).some((b) => b.textContent === MESSAGES.es.preview.republish)).toBe(true);
    view.unmount();
  });
});
