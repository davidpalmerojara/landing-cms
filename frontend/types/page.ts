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
}
