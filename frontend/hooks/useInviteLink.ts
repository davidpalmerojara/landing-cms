'use client';

import { useCallback, useState } from 'react';
import { api } from '@/lib/api';

type CopyState = 'idle' | 'copied' | 'error';

/** Creates an invite link for a page (owner only), copies it to the clipboard, and revokes every link of the page. */
export function useInviteLink(pageId: string) {
  const [link, setLink] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeState, setRevokeState] = useState<'idle' | 'revoked' | 'error'>('idle');

  const create = useCallback(async () => {
    setIsCreating(true);
    setHasError(false);
    setCopyState('idle');
    try {
      const invite = await api.pages.invite(pageId);
      setLink(new URL(invite.path, window.location.origin).toString());
      setRevokeState('idle');
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error('Could not create invite link:', e);
      setHasError(true);
    } finally {
      setIsCreating(false);
    }
  }, [pageId]);

  const copy = useCallback(async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopyState('copied');
    } catch (e) {
      // Clipboard blocked (permissions, insecure origin): the link stays selectable
      if (process.env.NODE_ENV === 'development') console.error('Could not copy invite link:', e);
      setCopyState('error');
    }
  }, [link]);

  /** Every link of the page stops working (SEC-005); the one on screen goes too. */
  const revoke = useCallback(async () => {
    setIsRevoking(true);
    setRevokeState('idle');
    try {
      await api.pages.revokeInvites(pageId);
      setLink(null);
      setCopyState('idle');
      setRevokeState('revoked');
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error('Could not revoke the invite links:', e);
      setRevokeState('error');
    } finally {
      setIsRevoking(false);
    }
  }, [pageId]);

  return { link, isCreating, hasError, copyState, create, copy, revoke, isRevoking, revokeState };
}
