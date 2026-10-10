'use client';

import { useState, useEffect, useRef } from 'react';
import { X, UserPlus, Trash2, Crown, Loader2, Users, Link2, Copy, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useEditorStore } from '@/store/editor-store';
import { useInviteLink } from '@/hooks/useInviteLink';
import { useCollaborators } from '@/hooks/useCollaborators';
import { useGuestSession } from '@/components/guest/GuestSessionProvider';

interface ShareModalProps {
  pageId: string;
  onClose: () => void;
}

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
      const result = await api.pages.share(pageId, email.trim());
      setSuccess(result.message);
      setEmail('');
      loadCollaborators();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('share.shareError');
      // Try to parse JSON error from API
      try {
        const parsed = JSON.parse(msg.replace(/^API \d+: /, ''));
        setError(parsed.error || msg);
      } catch {
        setError(msg);
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setRemovingId(userId);
    setError(null);
    setSuccess(null);

    try {
      const result = await api.pages.unshare(pageId, userId);
      setSuccess(result.message);
      loadCollaborators();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('share.removeError'));
    } finally {
      setRemovingId(null);
    }
  };

  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape + focus trap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    // Focus first focusable element on mount
    if (modalRef.current) {
      const first = modalRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const myUserId = useEditorStore((s) => s.myUserId);
  const { isGuest } = useGuestSession();
  // Invite, share and remove are the owner's (the server refuses them to collaborators)
  const isOwner = owner !== null && myUserId !== null && owner.id === myUserId;

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
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">
                      {owner.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-primary font-medium">{owner.username}</p>
                      <p className="text-xs text-muted">{owner.email}</p>
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
                    <div className="w-8 h-8 rounded-full bg-default flex items-center justify-center text-primary text-xs font-bold">
                      {collab.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-primary">{collab.username}</p>
                      <p className="text-xs text-muted">{collab.email}</p>
                    </div>
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => handleRemove(collab.id)}
                      disabled={removingId === collab.id}
                      aria-label={`${t('share.removeCollaborator')}: ${collab.username}`}
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
