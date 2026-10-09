/**
 * Conversion between the API's page shape and the editor's. Shared by the
 * editor, the preview and the public page so all three read blocks the same way.
 */
import { blockRegistry } from '@/lib/block-registry';
import { apiToTokens, tokensToApi } from '@/lib/design-tokens';
import type { ApiBlock, ApiPage } from '@/lib/api';
import { defaultBlockStyles } from '@/types/blocks';
import type { Block } from '@/types/blocks';
import type { Page } from '@/types/page';
import { defaultSeoFields } from '@/types/page';

/** API blocks in page order; per-device overrides travel inside styles.responsive. */
export function apiBlocksToLocal(apiBlocks: Pick<ApiBlock, 'id' | 'type' | 'order' | 'data' | 'styles'>[]): Block[] {
  return [...apiBlocks]
    .sort((a, b) => a.order - b.order)
    .map((b) => {
      const { responsive, ...baseStyles } = b.styles as Record<string, unknown>;
      return {
        id: b.id,
        type: b.type,
        name: blockRegistry[b.type]?.label || b.type,
        data: b.data,
        styles: { ...defaultBlockStyles, ...baseStyles },
        responsiveStyles: (responsive as Block['responsiveStyles']) || undefined,
      };
    });
}


export function apiPageToLocal(apiPage: ApiPage): Page {
  return {
    id: apiPage.id,
    name: apiPage.name,
    status: apiPage.status,
    slug: apiPage.slug,
    designTokens: apiToTokens(apiPage.design_tokens),
    seo: {
      seoTitle: apiPage.seo_title || '',
      seoDescription: apiPage.seo_description || '',
      seoCanonicalUrl: apiPage.seo_canonical_url || '',
      ogTitle: apiPage.og_title || '',
      ogDescription: apiPage.og_description || '',
      ogImage: apiPage.og_image || '',
      ogType: apiPage.og_type || 'website',
      noindex: apiPage.noindex ?? false,
    },
    publishedAt: apiPage.published_at ?? null,
    hasUnpublishedChanges: apiPage.has_unpublished_changes ?? false,
    blocks: apiBlocksToLocal(apiPage.blocks),
  };
}

export function localPageToApi(page: Page) {
  const seo = page.seo || defaultSeoFields;
  return {
    name: page.name,
    // status is not sent: it only changes through publish/unpublish (ADR-017)
    design_tokens: tokensToApi(page.designTokens),
    seo_title: seo.seoTitle,
    seo_description: seo.seoDescription,
    seo_canonical_url: seo.seoCanonicalUrl,
    og_title: seo.ogTitle,
    og_description: seo.ogDescription,
    og_image: seo.ogImage,
    og_type: seo.ogType,
    noindex: seo.noindex,
    blocks: page.blocks.map((b, i) => ({
      id: b.id,
      type: b.type,
      order: i,
      data: b.data,
      styles: {
        ...b.styles,
        ...(b.responsiveStyles ? { responsive: b.responsiveStyles } : {}),
      },
    })),
  };
}
