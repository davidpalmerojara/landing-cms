'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

const subscribeToNothing = () => () => {};

/** Whether the browser can hand a link to the system share sheet (phones, mostly). */
function canUseNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export type LinkAction = 'copied' | 'copyFailed' | 'shared';

/**
 * The public address of the page, copied or shared from a phone (MOBILE-010).
 * `url` is absolute (the path alone means nothing outside the app); `onDone`
 * hears how each action ended, so the caller can say it in a toast.
 */
export function usePublicLink(slug: string, name: string, onDone: (action: LinkAction) => void) {
  // The origin is only known in the browser; the server renders no link
  const origin = useSyncExternalStore(subscribeToNothing, () => window.location.origin, () => '');
  const url = useMemo(() => (origin ? new URL(`/p/${slug}`, origin).toString() : ''), [origin, slug]);
  const canShare = useSyncExternalStore(subscribeToNothing, canUseNativeShare, () => false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      onDone('copied');
    } catch (e) {
      // Clipboard blocked (permissions, insecure origin): the address stays on screen to select
      if (process.env.NODE_ENV === 'development') console.error('Could not copy the public link:', e);
      onDone('copyFailed');
    }
  }, [url, onDone]);

  const share = useCallback(async () => {
    try {
      await navigator.share({ title: name, url });
      onDone('shared');
    } catch (e) {
      // The person closed the share sheet: nothing went wrong
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (process.env.NODE_ENV === 'development') console.error('Could not share the public link:', e);
      onDone('copyFailed');
    }
  }, [url, name, onDone]);

  return { url, canShare, copy, share };
}

/** Toast type and text key for how a link action ended. */
export function linkActionToast(action: LinkAction): { type: 'success' | 'error'; messageKey: string } {
  if (action === 'copyFailed') return { type: 'error', messageKey: 'mobile.copyLinkError' };
  return { type: 'success', messageKey: action === 'copied' ? 'mobile.linkCopied' : 'mobile.linkShared' };
}
