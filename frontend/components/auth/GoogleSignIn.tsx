'use client';

import { useEffect, useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import GoogleOAuthWrapper from '@/components/GoogleOAuthWrapper';
import { useAppLocale } from '@/components/providers/AppIntlProvider';
import { useTheme } from '@/hooks/useTheme';

/** Google's button needs a client id; without one the page shows no Google option at all. */
export const GOOGLE_SIGN_IN_AVAILABLE = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

// Google draws the button in an iframe and only accepts a pixel width between 200 and 400
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

interface GoogleSignInProps {
  /** 'continue_with' on the login page, 'signup_with' on the register page */
  text: 'continue_with' | 'signup_with';
  onCredential: (credential: string) => void;
  onError: () => void;
}

function useAvailableWidth() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(MAX_WIDTH);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.floor(container.clientWidth))));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return { containerRef, width };
}

/**
 * The "Continue with Google" button. This is the only place that loads Google's
 * script (D5): only /login and /register render it, and only when a client id
 * is configured. The button follows the interface language and theme and fills
 * the width of the form.
 */
export default function GoogleSignIn({ text, onCredential, onError }: GoogleSignInProps) {
  const { locale } = useAppLocale();
  const { theme } = useTheme();
  const { containerRef, width } = useAvailableWidth();

  if (!GOOGLE_SIGN_IN_AVAILABLE) return null;

  return (
    <GoogleOAuthWrapper key={locale} locale={locale}>
      <div ref={containerRef} className="flex w-full justify-center">
        <GoogleLogin
          onSuccess={(response) => {
            if (response.credential) onCredential(response.credential);
          }}
          onError={onError}
          theme={theme === 'dark' ? 'filled_black' : 'outline'}
          size="large"
          text={text}
          width={width}
        />
      </div>
    </GoogleOAuthWrapper>
  );
}
