'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, UserPlus, Trash2, Crown, Loader2, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';

interface Collaborator {
  id: string;
  username: string;
  email: string;
}

interface ShareModalProps {
  pageId: string;
  onClose: () => void;
}

export default function ShareModal({ pageId, onClose }: ShareModalProps) {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [owner, setOwner] = useState<Collaborator | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadCollaborators = useCallback(async () => {
    try {
      const data = await api.pages.collaborators(pageId);
      setOwner(data.owner);
      setCollaborators(data.collaborators);
    } catch {
      setError(t('share.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [pageId, t]);

  useEffect(() => {
    loadCollaborators();
  }, [loadCollaborators]);

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
      await loadCollaborators();
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
      await loadCollaborators();
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

  const isOwner = owner !== null; // if we loaded owner, current user can see this page

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
        className="relative bg-surface-elevated border border-subtle rounded-xl shadow-2xl w-full max-w-[calc(100vw-32px)] sm:max-w-md mx-4 overflow-hidden"
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

        {/* Add collaborator form */}
        <form onSubmit={handleAdd} className="px-5 py-4 border-b border-subtle">
          <label className="text-xs text-secondary mb-2 block">{t('share.inviteByEmail')}</label>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('share.emailPlaceholder')}
              className="flex-1 bg-surface-card border border-default rounded-lg px-3 py-2 text-sm text-primary placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/50 focus:border-[#2563EB]/50"
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

          {/* Feedback messages */}
          {error && (
            <p className="mt-2 text-xs text-red-400">{error}</p>
          )}
          {success && (
            <p className="mt-2 text-xs text-emerald-400">{success}</p>
          )}
        </form>

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
                  <span className="flex items-center gap-1 text-xs text-amber-400 font-medium">
                    <Crown className="w-3 h-3" />
                    {t('share.owner')}
                  </span>
                </div>
              )}

              {/* Collaborators */}
              {collaborators.map((collab) => (
                <div key={collab.id} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-surface-card\/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-default flex items-center justify-center text-white text-xs font-bold">
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
                  {t('share.empty')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
