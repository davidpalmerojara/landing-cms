'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import { apiErrorMessage } from '@/lib/api-errors';
import { publishNotice } from '@/lib/publish-checks';

interface PublishHandlers {
  onPublish: () => Promise<boolean>;
  onUnpublish?: () => Promise<boolean>;
  /** Why the last publish or unpublish failed at the server (not the save before it) */
  publicationError?: () => unknown;
  /**
   * Quick Edit: the publish toast is the one message (with the note about
   * buttons without links folded in), worded for a phone (MOBILE2-005).
   */
  phone?: boolean;
}

/**
 * Publish and unpublish from the editor's top bar. Only the owner may do
 * either (D1); for anyone else the actions explain that instead. A publish
 * saves first, so a failed save is the usual reason it fails: the message
 * says so.
 */
export function usePublishActions({ onPublish, onUnpublish, publicationError, phone = false }: PublishHandlers) {
  const t = useTranslations();
  // Pages from servers that do not say who owns them are treated as the user's (the server decides anyway)
  const isOwner = useEditorStore((s) => s.page.isOwner !== false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  /** Public path of the page just published, shown with a link until dismissed */
  const [publishedPath, setPublishedPath] = useState<string | null>(null);

  const explainOwnerOnly = useCallback(() => {
    useEditorStore.getState().addToast(t('publishing.ownerOnly'), 'info');
  }, [t]);

  const failureMessage = useCallback((fallbackKey: string) => {
    if (useEditorStore.getState().saveIssue) return t('publishing.saveFirst');
    return apiErrorMessage(publicationError?.() ?? null, t, fallbackKey);
  }, [publicationError, t]);

  const publish = useCallback(async () => {
    if (!isOwner) {
      explainOwnerOnly();
      return;
    }
    setIsPublishing(true);
    setPublishedPath(null);
    const ok = await onPublish();
    setIsPublishing(false);
    const { page, addToast } = useEditorStore.getState();
    if (ok) {
      setPublishedPath(`/p/${page.slug}`);
      // Published anyway; only a heads-up about what visitors won't be able to use (D9)
      const notice = publishNotice(page.blocks, t, { phone });
      if (notice) addToast(notice, 'info');
      else if (phone) addToast(t('mobile.pagePublished'), 'success');
    } else {
      addToast(failureMessage('editor.publishError'), 'error');
    }
  }, [explainOwnerOnly, failureMessage, isOwner, onPublish, phone, t]);

  const unpublish = useCallback(async () => {
    if (!onUnpublish) return;
    if (!isOwner) {
      explainOwnerOnly();
      return;
    }
    setIsUnpublishing(true);
    setPublishedPath(null);
    const ok = await onUnpublish();
    setIsUnpublishing(false);
    const { addToast } = useEditorStore.getState();
    if (ok) addToast(t('publishing.unpublished'), 'success');
    else addToast(apiErrorMessage(publicationError?.() ?? null, t, 'publishing.unpublishError'), 'error');
  }, [explainOwnerOnly, isOwner, onUnpublish, publicationError, t]);

  const dismissPublished = useCallback(() => setPublishedPath(null), []);

  return { isOwner, isPublishing, isUnpublishing, publishedPath, publish, unpublish, dismissPublished, explainOwnerOnly };
}
