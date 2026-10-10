'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { GUEST_TEMPLATE_ID, guestStartErrorKey } from '@/lib/guest';
import { buildPagePayload } from '@/lib/templates';

/**
 * "Try it without signing up": starts a guest session, creates a page from the
 * SaaS template and opens it in the editor.
 *
 * If the browser already has a session (a real account or a live guest), it
 * goes to the dashboard instead: starting a guest would replace that session's
 * cookies and the person would lose access to their account.
 */
export function useStartGuest() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const start = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setIsStarting(true);

    try {
      await api.auth.me();
      router.push('/dashboard');
      return;
    } catch {
      // No valid session: the expected case, so a guest can be started
    }

    try {
      await api.auth.guest();
    } catch (e) {
      setError(t(guestStartErrorKey(e)));
      setIsStarting(false);
      inFlight.current = false;
      return;
    }

    try {
      const page = await api.pages.create(buildPagePayload(GUEST_TEMPLATE_ID, t('dashboard.createUntitled'), locale));
      router.push(`/editor/${page.id}`);
    } catch (e) {
      // The guest session exists; the dashboard lets them create a page by hand
      if (process.env.NODE_ENV === 'development') console.error('Could not create the guest starter page:', e);
      router.push('/dashboard');
    }
  }, [router, t, locale]);

  return { start, isStarting, error };
}
