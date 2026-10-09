'use client';

import { useCallback, useRef, useState } from 'react';
import { api, ContactSubmitError } from '@/lib/api';
import type { ContactFormPayload } from '@/lib/api';

export type ContactFormStatus = 'idle' | 'sending' | 'success' | 'error';
export type ContactFormErrorKind = 'invalid' | 'rateLimited' | 'unavailable' | 'generic';

export interface ContactFormValues {
  name: string;
  email: string;
  message: string;
  website: string;
}

function errorKindFor(error: unknown): ContactFormErrorKind {
  if (!(error instanceof ContactSubmitError)) return 'generic';
  if (error.status === 429) return 'rateLimited';
  if (error.status === 400) return 'invalid';
  if (error.status === 404) return 'unavailable';
  return 'generic';
}

/**
 * Sends a visitor's message through the public contact endpoint.
 * With no slug (editor, preview) nothing is ever sent.
 */
export function useContactForm(slug: string | null, blockId: string) {
  const [status, setStatus] = useState<ContactFormStatus>('idle');
  const [errorKind, setErrorKind] = useState<ContactFormErrorKind | null>(null);
  // Guards against a double submit before React re-renders with 'sending'
  const inFlight = useRef(false);

  const submit = useCallback(async (values: ContactFormValues): Promise<boolean> => {
    if (!slug || inFlight.current) return false;
    inFlight.current = true;
    setStatus('sending');
    setErrorKind(null);
    const payload: ContactFormPayload = { ...values, block_id: blockId };
    try {
      await api.public.submitContact(slug, payload);
      setStatus('success');
      return true;
    } catch (error: unknown) {
      setErrorKind(errorKindFor(error));
      setStatus('error');
      return false;
    } finally {
      inFlight.current = false;
    }
  }, [slug, blockId]);

  return { status, errorKind, isSending: status === 'sending', submit };
}
