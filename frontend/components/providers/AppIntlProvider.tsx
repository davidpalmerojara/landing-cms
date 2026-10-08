'use client';

import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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

// The cookie is the single source of truth: the server reads it to render
// the initial locale, so the client never has to correct it after hydration.
function persistLocale(locale: AppLocale) {
  document.documentElement.lang = locale;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export default function AppIntlProvider({ children, initialLocale }: AppIntlProviderProps) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

  useEffect(() => {
    persistLocale(locale);
  }, [locale]);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    startTransition(() => {
      setLocaleState(nextLocale);
    });
  }, []);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
    }),
    [locale, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
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
