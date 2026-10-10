import type { Page } from '@/types/page';
import { defaultSeoFields } from '@/types/page';
import type { Block, BlockDataMap, BlockType } from '@/types/blocks';
import { defaultBlockStyles } from '@/types/blocks';
import { cloneDesignTokens, defaultDesignTokens } from '@/lib/design-tokens';
import { makeBlock } from '@/lib/block-data';
import { getBlockDefaults } from '@/lib/block-defaults';
import { toContentLocale, type ContentLocale } from '@/lib/content-locale';

// Kept out of block-registry on purpose: the registry imports the block components, which import the editor store.

const heroText: Record<ContentLocale, Pick<BlockDataMap['hero'], 'title' | 'subtitle' | 'buttonText'>> = {
  es: {
    title: 'Crea landing pages increíbles.',
    subtitle: 'Un editor visual de próxima generación diseñado para equipos ambiciosos.',
    buttonText: 'Comenzar gratis',
  },
  en: {
    title: 'Create amazing landing pages.',
    subtitle: 'A next-generation visual editor built for ambitious teams.',
    buttonText: 'Get started for free',
  },
};

function defaultBlock<K extends BlockType>(
  id: string,
  type: K,
  name: string,
  locale: ContentLocale,
  data?: Partial<BlockDataMap[K]>,
): Block {
  return makeBlock(
    { id, name, styles: { ...defaultBlockStyles } },
    type,
    { ...getBlockDefaults(type, locale), ...data },
  );
}

/**
 * The page the editor store starts with, before a real page is loaded.
 * Its text is in `locale`; nothing already written is ever translated.
 */
export function getDefaultPage(locale: string = 'es'): Page {
  const content = toContentLocale(locale);
  return {
    id: 'page_default',
    name: 'Acme Landing',
    status: 'draft',
    slug: 'acme-landing',
    designTokens: cloneDesignTokens(defaultDesignTokens),
    seo: { ...defaultSeoFields },
    blocks: [
      defaultBlock('blk_default_1', 'hero', 'Hero Section', content, {
        ...heroText[content],
        badgeText: '',
        secondaryButtonText: '',
      }),
      defaultBlock('blk_default_2', 'features', 'Features Grid', content),
      defaultBlock('blk_default_3', 'testimonials', 'Testimonials', content),
      defaultBlock('blk_default_4', 'cta', 'Call to Action', content),
      defaultBlock('blk_default_5', 'footer', 'Footer Simple', content),
    ],
  };
}
