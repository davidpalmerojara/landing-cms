'use client';

import GoogleOAuthWrapper from '@/components/GoogleOAuthWrapper';
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
        {children}
      </AppIntlProvider>
    </GoogleOAuthWrapper>
  );
}
