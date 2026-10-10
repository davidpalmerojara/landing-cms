'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { X, UserPlus, Trash2, Crown, Loader2, Users, Link2, Copy, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { isGuestEmail, isGuestUsername } from '@/lib/collab-names';
import { useEditorStore } from '@/store/editor-store';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { useInviteLink } from '@/hooks/useInviteLink';
import { useCollaborators } from '@/hooks/useCollaborators';
import { useGuestSession } from '@/components/guest/GuestSessionProvider';

interface ShareModalProps {
  pageId: string;
  onClose: () => void;
}

type ShareErrorKey =
  | 'share.shareError'
  | 'share.removeError'
  | 'share.invalidEmail'
  | 'share.cannotShareSelf'
  | 'share.notOwner'
  | 'share.notCollaborator'
  | 'share.throttled';

/** Which translated message explains a failed share or unshare (never the server's raw text). */
export function shareErrorKey(error: unknown, action: 'share' | 'remove'): ShareErrorKey {
  const fallback = action === 'share' ? 'share.shareError' : 'share.removeError';
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 429) return 'share.throttled';
  if (error.status === 403) return 'share.notOwner';
  if (action === 'remove' && error.status === 404) return 'share.notCollaborator';
  if (action === 'share' && error.status === 400) {
    // A field error is the email; without one the only 400 is sharing with yourself
    return error.details ? 'share.invalidEmail' : 'share.cannotShareSelf';
  }
  return fallback;
}

/** Ids of the people connected to the page, as one comparable string. */
const presentUserIds = (s: { presence: { userId: string }[] }) =>
  [...new Set(s.presence.map((e) => e.userId))].sort().join(',');

export default function ShareModal({ pageId, onClose }: ShareModalProps) {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const { owner, collaborators, isLoading, hasError: hasLoadError, reload: loadCollaborators } = useCollaborators(pageId);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [actionError, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const error = actionError ?? (hasLoadError ? t('share.loadError') : null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsAdding(true);
    setError(null);
    setSuccess(null);

    try {
      await api.pages.share(pageId, email.trim());
      // The server says the same whether or not the address has an account
      setSuccess(t('share.shared'));
      setEmail('');
      loadCollaborators();
    } catch (err) {
      setError(t(shareErrorKey(err, 'share')));
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setRemovingId(userId);
    setError(null);
    setSuccess(null);

    try {
      await api.pages.unshare(pageId, userId);
      setSuccess(t('share.removed'));
      loadCollaborators();
    } catch (err) {
      setError(t(shareErrorKey(err, 'remove')));
    } finally {
      setRemovingId(null);
    }
  };

  const modalRef = useRef<HTMLDivElement>(null);
  // Focus moves in, Tab stays inside, Escape closes, and focus goes back to
  // "Compartir" when the dialog closes (QA-062)
  useDialogFocus(modalRef, true, onClose);
  // Escape also works when focus fell out of the dialog (the button that
  // created the invite link is replaced by the link); inside, the hook handles it
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Someone joined with an invite link while the dialog is open: show them (QA-062)
  const presenceKey = useEditorStore(presentUserIds);
  const knownIds = useMemo(
    () => new Set([owner?.id, ...collaborators.map((c) => c.id)].filter(Boolean)),
    [owner, collaborators],
  );
  const lastPresenceKey = useRef(presenceKey);
  useEffect(() => {
    if (isLoading || presenceKey === lastPresenceKey.current) return;
    lastPresenceKey.current = presenceKey;
    if (presenceKey.split(',').some((id) => id && !knownIds.has(id))) loadCollaborators();
  }, [presenceKey, isLoading, knownIds, loadCollaborators]);

  /** A guest's generated username and placeholder email mean nothing to people: "Invitado", no email. */
  const shownName = (username: string) => (isGuestUsername(username) ? t('share.guest') : username);
  const shownEmail = (address: string | undefined) => (address && !isGuestEmail(address) ? address : null);

  const myUserId = useEditorStore((s) => s.myUserId);
  const { isGuest } = useGuestSession();
  // Invite, share and remove are the owner's (the server refuses them to collaborators)
  const isOwner = owner !== null && myUserId !== null && owner.id === myUserId;
  // Live editing is off on this plan: said here instead of a toast on every open (EDITOR2-007)
  const realtimeUnavailable = useEditorStore((s) => s.collabStatus === 'unavailable');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        className="relative bg-surface-elevated border border-subtle rounded-xl shadow-2xl w-full max-w-[calc(100vw-32px)] sm:max-w-md mx-4 max-h-[calc(100dvh-32px)] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-subtle">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-color" />
            <h2 id="share-modal-title" className="text-sm font-semibold text-primary">{t('share.title')}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1 text-muted hover:text-secondary rounded hover:bg-surface-card transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Add collaborator form (email sharing needs an account) */}
        {isOwner && !isGuest && (
          <form onSubmit={handleAdd} className="px-5 py-4 border-b border-subtle">
            <label htmlFor="share-email" className="text-xs text-secondary mb-2 block">{t('share.inviteByEmail')}</label>
            <div className="flex gap-2">
              <input
                id="share-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('share.emailPlaceholder')}
                className="flex-1 bg-surface-card border border-default rounded-lg px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
                disabled={isAdding}
              />
              <button
                type="submit"
                disabled={isAdding || !email.trim()}
                className="disabled:opacity-50 text-white font-bold text-sm px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors"
                style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
              >
                {isAdding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                {t('share.invite')}
              </button>
            </div>
          </form>
        )}
        {isOwner && isGuest && (
          <p className="px-5 pt-4 text-xs text-secondary">{t('share.guestEmailLocked')}</p>
        )}
        {isOwner && realtimeUnavailable && (
          <p className="px-5 pt-4 text-xs text-secondary">{t('share.realtimeNeedsPro')}</p>
        )}
        {!isLoading && owner && !isOwner && (
          <p className="px-5 py-4 border-b border-subtle text-xs text-secondary">{t('share.notOwner')}</p>
        )}

        {/* Feedback of loading, sharing and removing */}
        {(error || success) && (
          <div className="px-5 pt-3">
            {error && <p role="alert" className="text-xs text-error">{error}</p>}
            {success && <p role="status" className="text-xs text-success">{success}</p>}
          </div>
        )}

        {isOwner && <InviteLinkSection pageId={pageId} />}

        {/* Collaborators list */}
        <div className="px-5 py-4 max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted" />
            </div>
          ) : (
            <div className="space-y-1">
              {/* Owner */}
              {owner && (
                <div className="flex items-center justify-between py-2 px-2 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div aria-hidden="true" className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">
                      {shownName(owner.username).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-primary font-medium">{shownName(owner.username)}</p>
                      {shownEmail(owner.email) && <p className="text-xs text-muted">{shownEmail(owner.email)}</p>}
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-warning font-medium">
                    <Crown className="w-3 h-3" />
                    {t('share.owner')}
                  </span>
                </div>
              )}

              {/* Collaborators */}
              {collaborators.map((collab) => (
                <div key={collab.id} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-surface-card/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div aria-hidden="true" className="w-8 h-8 rounded-full bg-default flex items-center justify-center text-primary text-xs font-bold">
                      {shownName(collab.username).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-primary">{shownName(collab.username)}</p>
                      {shownEmail(collab.email) && <p className="text-xs text-muted">{shownEmail(collab.email)}</p>}
                    </div>
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => handleRemove(collab.id)}
                      disabled={removingId === collab.id}
                      aria-label={`${t('share.removeCollaborator')}: ${shownName(collab.username)}`}
                      className="p-1.5 text-muted hover:text-red-400 rounded hover:bg-surface-card transition-colors disabled:opacity-50"
                      title={t('share.removeCollaborator')}
                    >
                      {removingId === collab.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              ))}

              {collaborators.length === 0 && (
                <p className="text-xs text-muted text-center py-4">
                  {isGuest ? t('share.emptyGuest') : t('share.empty')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Owner only: a link that lets whoever opens it edit the page, with a copy button. */
function InviteLinkSection({ pageId }: { pageId: string }) {
  const t = useTranslations();
  const { link, isCreating, hasError, copyState, create, copy } = useInviteLink(pageId);

  return (
    <section aria-labelledby="share-invite-link-title" className="px-5 py-4 border-b border-subtle">
      <h3 id="share-invite-link-title" className="text-xs text-secondary mb-1 flex items-center gap-1.5">
        <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
        {t('share.inviteLinkTitle')}
      </h3>
      <p className="text-xs text-muted mb-3">{t('share.inviteLinkDescription')}</p>

      {link ? (
        <>
          <label htmlFor="share-invite-link" className="sr-only">{t('share.inviteLinkLabel')}</label>
          <div className="flex gap-2">
            <input
              id="share-invite-link"
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 bg-surface-card border border-default rounded-lg px-3 py-2 text-xs font-mono text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              type="button"
              onClick={copy}
              className="min-h-11 shrink-0 text-white font-bold text-sm px-3 rounded-lg flex items-center gap-1.5 bg-primary hover:bg-primary-dark transition-colors"
            >
              {copyState === 'copied' ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
              {copyState === 'copied' ? t('share.inviteLinkCopied') : t('share.inviteLinkCopy')}
            </button>
          </div>
          <p className="mt-2 text-xs text-secondary">{t('share.inviteLinkHint')}</p>
          {copyState === 'error' && (
            <p role="alert" className="mt-2 text-xs text-error">{t('share.inviteLinkCopyError')}</p>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={create}
          disabled={isCreating}
          aria-busy={isCreating}
          className="min-h-11 w-full text-sm font-medium px-3 rounded-lg border border-default text-primary hover:bg-surface-card flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
        >
          {isCreating ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Link2 className="w-4 h-4" aria-hidden="true" />}
          {isCreating ? t('share.inviteLinkCreating') : t('share.inviteLinkCreate')}
        </button>
      )}
      {hasError && (
        <p role="alert" className="mt-2 text-xs text-error">{t('share.inviteLinkError')}</p>
      )}
    </section>
  );
}
