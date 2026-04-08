import en from '@/messages/en.json';
import es from '@/messages/es.json';

export const LOCALE_STORAGE_KEY = 'paxl-locale';
export const LOCALE_COOKIE = 'paxl-locale';
export const LOCALES = ['es', 'en'] as const;

export type AppLocale = (typeof LOCALES)[number];
export type AppMessages = typeof es;

export const MESSAGES: Record<AppLocale, AppMessages> = {
  es,
  en,
};

export function isLocale(value: string | null | undefined): value is AppLocale {
  return value === 'es' || value === 'en';
}

export function resolveLocale(
  storedLocale: string | null | undefined,
  acceptLanguage: string | null | undefined,
): AppLocale {
  if (isLocale(storedLocale)) {
    return storedLocale;
  }

  if (acceptLanguage && acceptLanguage.toLowerCase().includes('en')) {
    return 'en';
  }

  return 'es';
}
