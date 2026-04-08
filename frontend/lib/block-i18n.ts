const TRANSLATABLE_BLOCK_TYPES = new Set([
  'hero',
  'features',
  'pricing',
  'testimonials',
  'cta',
  'faq',
  'footer',
  'contact',
  'gallery',
  'navbar',
  'stats',
  'team',
  'timeline',
  'logoCloud',
  'customHtml',
]);

export function getTranslatedBlockLabel(
  type: string,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
  fallback?: string,
) {
  if (TRANSLATABLE_BLOCK_TYPES.has(type)) {
    return t(`blocks.${type}`);
  }

  return fallback || type;
}
