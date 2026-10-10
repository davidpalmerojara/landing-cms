/**
 * Language of the content the app writes for the user (new blocks, templates).
 * It follows the interface language when the content is created; content that
 * already exists is never translated.
 */
export type ContentLocale = 'es' | 'en';

export const CONTENT_LOCALES: readonly ContentLocale[] = ['es', 'en'];

/** The content language for an interface locale ("en", "en-US"...); Spanish for anything else. */
export function toContentLocale(locale: string | null | undefined): ContentLocale {
  return locale?.toLowerCase().startsWith('en') ? 'en' : 'es';
}
