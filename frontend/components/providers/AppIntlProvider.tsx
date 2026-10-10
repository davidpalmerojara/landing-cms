'use client';

import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { LOCALE_COOKIE, MESSAGES, type AppLocale } from '@/lib/i18n';

interface LocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

interface AppIntlProviderProps {
  children: React.ReactNode;
  initialLocale: AppLocale;
}

// The cookie is written only when the person switches language (D5, QA-025):
// visiting a page must not set a cookie. Without it the server falls back to
// Accept-Language, so the first render is already in the right language. With
// it, the server renders every later visit in the chosen language.
function rememberLocale(locale: AppLocale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export default function AppIntlProvider({ children, initialLocale }: AppIntlProviderProps) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

  // Screen readers and the API client (Accept-Language) read the language from <html lang>
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    rememberLocale(nextLocale);
    startTransition(() => {
      setLocaleState(nextLocale);
    });
    // Server-rendered parts (the <title>, <html lang>) follow the cookie we just wrote
    router.refresh();
  }, [router]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
    }),
    [locale, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>
      {/* Fixed time zone so server and client format dates identically. */}
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Europe/Madrid">
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function useAppLocale() {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error('useAppLocale must be used within AppIntlProvider');
  }

  return context;
}
