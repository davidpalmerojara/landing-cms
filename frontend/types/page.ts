import type { Block } from './blocks';
import type { DesignTokens } from '@/lib/design-tokens';

export interface SeoFields {
  seoTitle: string;
  seoDescription: string;
  seoCanonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogType: string;
  noindex: boolean;
  /** BCP 47 tag of the language the page is written in: `<html lang>` of the published page (ADR-033) */
  language: string;
}

export const defaultSeoFields: SeoFields = {
  seoTitle: '',
  seoDescription: '',
  seoCanonicalUrl: '',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  ogType: 'website',
  noindex: false,
  language: 'es',
};

export interface Page {
  id: string;
  name: string;
  status: string;
  slug: string;
  designTokens: DesignTokens;
  seo: SeoFields;
  blocks: Block[];
  /** When the public copy was last frozen (ADR-017). Read-only, from the server. */
  publishedAt?: string | null;
  /** The draft was edited after the last publish. Read-only, from the server. */
  hasUnpublishedChanges?: boolean;
  /** The person editing owns the page; undefined when the server did not say. Read-only, from the server. */
  isOwner?: boolean;
}
