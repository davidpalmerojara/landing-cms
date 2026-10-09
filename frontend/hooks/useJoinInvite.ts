'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export type JoinError = 'invalid' | 'throttled' | 'capacity' | 'generic';
export type JoinState = { status: 'joining' } | { status: 'error'; error: JoinError };

/** Why joining failed: unknown or used-up link (404), too many guests per IP (429), no room (503). */
export function joinErrorKind(error: unknown): JoinError {
  if (error instanceof ApiError) {
    if (error.status === 404 || error.code === 'INVITE_INVALID') return 'invalid';
    if (error.status === 429) return 'throttled';
    if (error.status === 503 || error.code === 'GUEST_CAPACITY') return 'capacity';
  }
  return 'generic';
}

/**
 * Opens a page from an invite link: the server adds this person as a
 * collaborator (as a new guest when signed out) and the editor opens.
 */
export function useJoinInvite(token: string) {
  const router = useRouter();
  const [state, setState] = useState<JoinState>({ status: 'joining' });
  // Each call can use up the link: one request per token, even if effects run twice
  const requestedRef = useRef<string | null>(null);

  const request = useCallback(() => {
    return api.auth.join(token).then(
      ({ page_id: pageId }) => router.replace(`/editor/${pageId}`),
      (e: unknown) => {
        if (process.env.NODE_ENV === 'development') console.error('Could not join the page:', e);
        setState({ status: 'error', error: joinErrorKind(e) });
      },
    );
  }, [router, token]);

  useEffect(() => {
    if (!token || requestedRef.current === token) return;
    requestedRef.current = token;
    void request();
  }, [request, token]);

  const retry = useCallback(() => {
    setState({ status: 'joining' });
    void request();
  }, [request]);

  return { state, retry };
}
