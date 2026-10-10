/**
 * The language a page is written in (Page.language, ADR-033): a BCP 47 tag
 * such as "es", "en" or "pt-BR". It is the `<html lang>` of the published page,
 * and the language of the few words Paxl itself puts inside the blocks
 * (landmark names, "Popular", the contact form's labels and errors) when Paxl
 * has them in that language.
 */
import { isLocale, type AppLocale } from '@/lib/i18n';
import { toContentLocale } from '@/lib/content-locale';

export const DEFAULT_PAGE_LANGUAGE = 'es';

/** Same rule as the server (pages/models.py language_tag_validator). */
const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/;
const MAX_LANGUAGE_LENGTH = 12;

/** Languages the SEO panel offers; any valid tag already stored is offered too. */
export const PAGE_LANGUAGE_OPTIONS = ['es', 'en', 'ca', 'gl', 'eu', 'pt', 'fr', 'de', 'it'] as const;

export function isLanguageTag(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_LANGUAGE_LENGTH && LANGUAGE_TAG.test(value);
}

/** The page's language from the API, or the default for a missing or malformed value. */
export function pageLanguage(value: unknown): string {
  return isLanguageTag(value) ? value : DEFAULT_PAGE_LANGUAGE;
}

/** The language a new page starts with: the interface language at creation (ADR-025). */
export function newPageLanguage(uiLocale: string | null | undefined): string {
  return toContentLocale(uiLocale);
}

/** Paxl's messages to use inside the blocks of a page in `language`, or null when Paxl has none in it. */
export function pageMessagesLocale(language: string | null | undefined): AppLocale | null {
  const primary = (language ?? '').split('-')[0].toLowerCase();
  return isLocale(primary) ? primary : null;
}

/** The name of a language in the interface language ("inglés", "English"); the tag itself if unknown. */
export function languageName(tag: string, uiLocale: string): string {
  try {
    return new Intl.DisplayNames([uiLocale], { type: 'language' }).of(tag) ?? tag;
  } catch (error: unknown) {
    // Intl rejects malformed tags; show the tag as stored
    if (error instanceof RangeError) return tag;
    throw error;
  }
}
