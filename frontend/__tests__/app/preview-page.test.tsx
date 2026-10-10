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

  it('names the page in the tab title; the page area declares its language, the interface keeps its own (QA-085, PUBLIC2-006)', async () => {
    vi.spyOn(api.pages, 'get').mockResolvedValue(apiPage());
    const view = render(<PreviewPage />);
    await flush();

    expect(document.title).toContain('Mi landing');
    // Paxl's bar is in the interface language (es), only the page area is in the page's (en)
    expect(document.documentElement.lang).not.toBe('en');
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
    // Just published, nothing changed since: nothing left to publish (PUBLIC2-011)
    const buttons = Array.from(view.container.querySelectorAll('button'));
    expect(buttons.some((b) => b.textContent === MESSAGES.es.preview.republish)).toBe(false);
    expect(buttons.find((b) => b.textContent === MESSAGES.es.preview.upToDate)?.disabled).toBe(true);
    view.unmount();
  });

  it('PUBLIC2-001: a collaborator gets no publish button, only the reason', async () => {
    vi.spyOn(api.pages, 'get').mockResolvedValue(apiPage({ is_owner: false }));
    const publish = vi.spyOn(api.pages, 'publish');
    const view = render(<PreviewPage />);
    await flush();

    const labels = Array.from(view.container.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).not.toContain(MESSAGES.es.preview.publish);
    expect(view.container.textContent).toContain(MESSAGES.es.publishing.ownerOnly);
    expect(publish).not.toHaveBeenCalled();
    view.unmount();
  });

  it('PUBLIC2-011: a published page with no changes does not offer "Publicar cambios"', async () => {
    vi.spyOn(api.pages, 'get').mockResolvedValue(apiPage({ status: 'published', has_unpublished_changes: false }));
    const view = render(<PreviewPage />);
    await flush();

    const button = Array.from(view.container.querySelectorAll('button')).find((b) => b.textContent === MESSAGES.es.preview.upToDate);
    expect(button?.disabled).toBe(true);
    expect(Array.from(view.container.querySelectorAll('button')).some((b) => b.textContent === MESSAGES.es.preview.republish)).toBe(false);
    view.unmount();
  });

  it('PUBLIC2-011: once the draft has unpublished changes it offers to publish them', async () => {
    vi.spyOn(api.pages, 'get').mockResolvedValue(apiPage({ status: 'published', has_unpublished_changes: true }));
    const view = render(<PreviewPage />);
    await flush();

    const button = Array.from(view.container.querySelectorAll('button')).find((b) => b.textContent === MESSAGES.es.preview.republish);
    expect(button?.disabled).toBe(false);
    view.unmount();
  });
});
