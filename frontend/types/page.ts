import type { Block } from './blocks';
import type { ThemeColors } from '@/lib/themes';
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
};

export interface Page {
  id: string;
  name: string;
  status: string;
  slug: string;
  themeId: string;
  customTheme?: ThemeColors;
  designTokens?: DesignTokens;
  seo: SeoFields;
  blocks: Block[];
  /** When the public copy was last frozen (ADR-017). Read-only, from the server. */
  publishedAt?: string | null;
  /** The draft was edited after the last publish. Read-only, from the server. */
  hasUnpublishedChanges?: boolean;
}
