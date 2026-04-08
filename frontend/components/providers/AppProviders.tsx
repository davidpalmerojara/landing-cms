'use client';

import GoogleOAuthWrapper from '@/components/GoogleOAuthWrapper';
import PreferencesDock from '@/components/ui/PreferencesDock';
import type { AppLocale } from '@/lib/i18n';
import AppIntlProvider from './AppIntlProvider';

interface AppProvidersProps {
  children: React.ReactNode;
  initialLocale: AppLocale;
}

export default function AppProviders({ children, initialLocale }: AppProvidersProps) {
  return (
    <GoogleOAuthWrapper>
      <AppIntlProvider initialLocale={initialLocale}>
        <PreferencesDock />
        {children}
      </AppIntlProvider>
    </GoogleOAuthWrapper>
  );
}
