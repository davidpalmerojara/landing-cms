'use client';

import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { LOCALE_COOKIE, LOCALE_STORAGE_KEY, MESSAGES, type AppLocale, isLocale } from '@/lib/i18n';

interface LocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

interface AppIntlProviderProps {
  children: React.ReactNode;
  initialLocale: AppLocale;
}

function persistLocale(locale: AppLocale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage may be unavailable.
  }

  document.documentElement.lang = locale;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export default function AppIntlProvider({ children, initialLocale }: AppIntlProviderProps) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

  useEffect(() => {
    let resolvedLocale = initialLocale;

    try {
      const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isLocale(storedLocale)) {
        resolvedLocale = storedLocale;
      }
    } catch {
      // Storage may be unavailable.
    }

    if (resolvedLocale !== initialLocale) {
      setLocaleState(resolvedLocale);
    }

    persistLocale(resolvedLocale);
  }, [initialLocale]);

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
