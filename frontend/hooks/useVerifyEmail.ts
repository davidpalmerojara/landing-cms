'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { accountErrorMessage } from '@/lib/account-errors';

export type VerifyEmailState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'sent' }
  | { status: 'failed'; message: string };

/**
 * Verifying an email is opening the magic link sent to it (ADR-052). `send`
 * requests that link for the signed-in account's own address; `failed.message`
 * is already in the interface language (never the server's text).
 */
export function useVerifyEmail(email: string) {
  const t = useTranslations();
  const [state, setState] = useState<VerifyEmailState>({ status: 'idle' });

  const send = useCallback(async () => {
    setState({ status: 'sending' });
    try {
      await api.auth.magicRequest(email);
      setState({ status: 'sent' });
    } catch (e) {
      setState({ status: 'failed', message: accountErrorMessage(e, t, 'verifyEmail.error') });
    }
  }, [email, t]);

  return { state, send };
}
