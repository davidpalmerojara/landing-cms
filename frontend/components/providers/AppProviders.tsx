'use client';

import type { AppLocale } from '@/lib/i18n';
import AppIntlProvider from './AppIntlProvider';

interface AppProvidersProps {
  children: React.ReactNode;
  initialLocale: AppLocale;
}

// Google's sign-in script is not mounted here: only /login and /register load it
// (components/GoogleOAuthWrapper.tsx), so visitors of published pages and the rest
// of the app never contact Google (D5, QA-025).
export default function AppProviders({ children, initialLocale }: AppProvidersProps) {
  return <AppIntlProvider initialLocale={initialLocale}>{children}</AppIntlProvider>;
}
