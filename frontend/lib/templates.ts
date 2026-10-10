import { defaultBlockStyles } from '@/types/blocks';
import type { Block, BlockDataMap, BlockType } from '@/types/blocks';
import { newBlockId } from '@/lib/block-factory';
import { defaultDesignTokens, presetTokens, tokensToApi } from '@/lib/design-tokens';
import type { DesignTokens } from '@/lib/design-tokens';
import { makeBlock } from '@/lib/block-data';
import { toContentLocale } from '@/lib/content-locale';
import { newPageLanguage } from '@/lib/page-language';
import type { ContentLocale } from '@/lib/content-locale';
import { saasLanding } from '@/lib/template-content/saas-landing';
import { portfolio } from '@/lib/template-content/portfolio';
import { restaurant } from '@/lib/template-content/restaurant';
import { comingSoon } from '@/lib/template-content/coming-soon';

/** A block of a template: any subset of its type's data (the rest is empty). */
export type TemplateBlock = {
  [K in BlockType]: {
    type: K;
    data: Partial<BlockDataMap[K]>;
    styles?: Partial<typeof defaultBlockStyles>;
  };
}[BlockType];

/** What a person reads and gets in one language. */
export interface TemplateContent {
  name: string;
  description: string;
  category: string;
  /** Block types in order; each can override data and styles */
  blocks: TemplateBlock[];
}

/** A template in every content language. Same blocks in the same order, different words. */
export interface TemplateDefinition {
  id: string;
  /** Id of the tokenPresets entry whose colors the page starts with */
  presetId: string;
  content: Record<ContentLocale, TemplateContent>;
}

/** A template in one language, as the picker shows it and the page is created from it. */
export interface PageTemplate extends TemplateContent {
  id: string;
  presetId: string;
}

const templateDefinitions: TemplateDefinition[] = [saasLanding, portfolio, restaurant, comingSoon];

/** The templates written in `locale` (the interface language), in picker order. */
export function getPageTemplates(locale: string | null | undefined): PageTemplate[] {
  const language = toContentLocale(locale);
  return templateDefinitions.map(({ id, presetId, content }) => ({ id, presetId, ...content[language] }));
}

/** Instantiate a template's blocks with unique IDs */
export function instantiateTemplate(template: PageTemplate): {
  blocks: Block[];
  designTokens: DesignTokens;
  name: string;
} {
  const blocks: Block[] = template.blocks.map((def) =>
    makeBlock({ id: newBlockId(), name: def.type, styles: { ...defaultBlockStyles, ...def.styles } }, def.type, def.data),
  );
  return { blocks, designTokens: presetTokens(template.presetId), name: template.name };
}

/**
 * Body of `POST /api/pages/` for a new page: the template's blocks and theme
 * in `locale`, or a blank page named `blankName` when `templateId` is null or unknown.
 */
export function buildPagePayload(
  templateId: string | null,
  blankName: string,
  locale: string | null | undefined,
): Record<string, unknown> {
  const template = templateId ? getPageTemplates(locale).find((candidate) => candidate.id === templateId) : undefined;
  if (!template) {
    return { name: blankName, language: newPageLanguage(locale), design_tokens: tokensToApi(defaultDesignTokens), blocks: [] };
  }
  const { blocks, designTokens, name } = instantiateTemplate(template);
  return {
    name,
    // The page is written in the language of the template's content (ADR-025, ADR-033)
    language: newPageLanguage(locale),
    design_tokens: tokensToApi(designTokens),
    blocks: blocks.map((b, i) => ({
      id: b.id,
      type: b.type,
      order: i,
      data: b.data,
      styles: b.styles,
    })),
  };
}
