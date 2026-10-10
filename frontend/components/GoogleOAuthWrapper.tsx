'use client';

import { GoogleOAuthProvider } from '@react-oauth/google';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

interface GoogleOAuthWrapperProps {
  children: React.ReactNode;
  /** Language of Google's button, e.g. 'es' (it renders in the browser's language otherwise) */
  locale?: string;
}

/**
 * Loads Google's sign-in script for what it wraps. Mount it only where the Google
 * button is shown (/login and /register): the script, and the cookie it sets, must
 * not reach the rest of the app or the pages visitors read (D5).
 */
export default function GoogleOAuthWrapper({ children, locale }: GoogleOAuthWrapperProps) {
  if (!GOOGLE_CLIENT_ID) return <>{children}</>;
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID} locale={locale}>
      {children}
    </GoogleOAuthProvider>
  );
}
