'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import { usePublishActions } from '@/hooks/usePublishActions';
import { useCloseOnBack } from '@/hooks/useCloseOnBack';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import MobileBottomSheet from './MobileBottomSheet';

interface MobilePublishSheetProps {
  open: boolean;
  onClose: () => void;
  onPublish: () => Promise<boolean>;
  onUnpublish?: () => Promise<boolean>;
  /** Why the last publish or unpublish failed at the server */
  publicationError?: () => unknown;
}

/** Where the page stands for visitors: never published, published with newer edits, or published as it is. */
export type PublicationState = 'draft' | 'changes' | 'live';

export function publicationState(status: string, hasUnpublishedChanges: boolean | undefined): PublicationState {
  if (status !== 'published') return 'draft';
  return hasUnpublishedChanges ? 'changes' : 'live';
}

const PRIMARY_BUTTON = 'w-full min-h-11 py-3.5 rounded-xl text-sm font-semibold text-white bg-primary active:bg-primary-dark disabled:opacity-50';

/**
 * Publishing from a phone, with the same three states as the desktop top bar
 * (QA-014): a draft publishes; a published page with newer edits says so and
 * publishes the changes; a published page links to itself. Only the owner
 * publishes or unpublishes (ADR-032); anyone else is told why.
 */
export default function MobilePublishSheet({ open, onClose, onPublish, onUnpublish, publicationError }: MobilePublishSheetProps) {
  const t = useTranslations();
  const page = useEditorStore((s) => s.page);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const cancelUnpublish = useCallback(() => setConfirmUnpublish(false), []);
  // On top of the sheet: back and Escape close the question, not the sheet
  useCloseOnBack(confirmUnpublish, cancelUnpublish);
  const {
    isOwner, isPublishing, isUnpublishing, publishedPath, publish, unpublish, dismissPublished,
  } = usePublishActions({ onPublish, onUnpublish, publicationError, phone: true });
  const state = publicationState(page.status, page.hasUnpublishedChanges);
  const publicPath = `/p/${page.slug}`;

  // Published: close (the hook has said so in one toast; a failure leaves the sheet open, with its error toast)
  useEffect(() => {
    if (!publishedPath) return;
    dismissPublished();
    onClose();
  }, [dismissPublished, onClose, publishedPath]);

  // The title says what the sheet is for this person now (MOBILE2-010)
  const title = state === 'live' ? t('mobile.publishedTitle')
    : !isOwner ? t('mobile.publishingTitle')
    : state === 'changes' ? t('mobile.publishChangesTitle')
    : t('mobile.publishTitle');

  return (
    <>
      <MobileBottomSheet
        open={open}
        onClose={onClose}
        title={title}
        ariaLabel={title}
        fullHeight={false}
        closeLabel={t('common.close')}
      >
        <div className="px-5 py-4 space-y-4">
          {state === 'draft' && isOwner && (
            <p className="text-sm text-secondary">{t('mobile.publishDescription', { slug: page.slug })}</p>
          )}

          {state === 'changes' && (
            <div className="flex items-start gap-3 px-4 py-3 bg-warning/10 border border-warning/30 rounded-xl">
              <span className="mt-1.5 w-2 h-2 rounded-full bg-warning shrink-0" aria-hidden="true" />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-primary">{t('editor.unpublishedChanges')}</p>
                <p className="text-sm text-secondary">{t('mobile.publishChangesDescription', { slug: page.slug })}</p>
              </div>
            </div>
          )}

          {state === 'live' && (
            <div className="flex items-center gap-3 px-4 py-3 bg-success/10 border border-success/30 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-success shrink-0" aria-hidden="true" />
              <span className="text-sm text-primary font-medium">{t('mobile.publishedAt', { slug: page.slug })}</span>
            </div>
          )}

          {isOwner ? (
            state !== 'live' && (
              <button type="button" onClick={() => void publish()} disabled={isPublishing} className={PRIMARY_BUTTON}>
                {isPublishing
                  ? t('editor.publishLoading')
                  : state === 'changes' ? t('editor.publishChanges') : t('common.publish')}
              </button>
            )
          ) : (
            <p className="flex items-start gap-2 text-sm text-secondary">
              <Info size={16} className="shrink-0 mt-0.5 text-primary-color" aria-hidden="true" />
              {t('publishing.ownerOnly')}
            </p>
          )}

          {state !== 'draft' && (
            <a
              href={publicPath}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-11 py-3 rounded-xl border border-default/20 bg-surface-card text-sm font-semibold text-primary flex items-center justify-center gap-2 active:bg-surface-elevated"
            >
              {t('mobile.viewPublicPage')}
              <ExternalLink size={14} aria-hidden="true" />
              <span className="sr-only">{t('publishing.opensInNewTab')}</span>
            </a>
          )}

          {isOwner && state !== 'draft' && onUnpublish && (
            <button
              type="button"
              onClick={() => setConfirmUnpublish(true)}
              disabled={isUnpublishing}
              className="w-full min-h-11 py-3 rounded-xl text-sm font-medium text-error active:bg-error/10 disabled:opacity-50"
            >
              {isUnpublishing ? t('publishing.unpublishing') : t('publishing.unpublish')}
            </button>
          )}
        </div>
      </MobileBottomSheet>

      <ConfirmDialog
        open={confirmUnpublish}
        title={t('publishing.unpublishTitle')}
        message={t('publishing.unpublishMessage')}
        confirmLabel={t('publishing.unpublish')}
        variant="danger"
        onConfirm={() => {
          setConfirmUnpublish(false);
          onClose();
          void unpublish();
        }}
        onCancel={cancelUnpublish}
      />
    </>
  );
}
