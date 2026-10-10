'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Monitor, Smartphone, Tablet,
  Eye, Save, CheckCircle2, BookmarkPlus,
  Loader2, Globe, Share2, BarChart3, Search, MessageSquare,
  Pencil, History, X, Check, Palette, ChevronDown, ExternalLink,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import ShareModal from './ShareModal';
import ConnectionIndicator from './ConnectionIndicator';
import SaveStatusIndicator from './SaveStatusIndicator';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { presenceInitials } from '@/lib/collab-names';
import { useEditorStore, getUserColor, uniquePresenceUsers } from '@/store/editor-store';
import type { PresenceEntry } from '@/store/editor-store';
import ThemeToggle from '@/components/ui/ThemeToggle';
import LocaleSwitcher from '@/components/ui/LocaleSwitcher';
import { useLeaveEditor } from '@/hooks/useLeaveEditor';
import { usePublishActions } from '@/hooks/usePublishActions';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import { flushPendingSave } from '@/lib/save-flush';
import type { RejectedField } from '@/lib/page-sync';

type EditorView = 'design' | 'styles' | 'seo' | 'analytics' | 'messages';

interface TopBarProps {
  onSave: () => Promise<boolean>;
  onPublish: () => Promise<boolean>;
  onUnpublish?: () => Promise<boolean>;
  /** Why the last publish or unpublish failed at the server */
  publicationError?: () => unknown;
  /** Take the user to a field the server refused */
  onShowRejectedField?: (field: RejectedField) => void;
  activeView?: EditorView;
  onViewChange?: (view: EditorView) => void;
  onOpenHistory?: () => void;
}

/** 44 px controls on touch screens (ADR-043, EDITOR2-003). */
const TOUCH_TARGET = 'pointer-coarse:min-h-11 pointer-coarse:min-w-11 justify-center';

const VIEW_BUTTONS: { view: EditorView; labelKey: string; Icon: typeof Pencil }[] = [
  { view: 'design', labelKey: 'editor.viewDesign', Icon: Pencil },
  { view: 'styles', labelKey: 'editor.viewStyles', Icon: Palette },
  { view: 'seo', labelKey: 'editor.viewSeo', Icon: Search },
  { view: 'analytics', labelKey: 'editor.viewAnalytics', Icon: BarChart3 },
  { view: 'messages', labelKey: 'editor.viewMessages', Icon: MessageSquare },
];

export default function TopBar({
  onSave,
  onPublish,
  onUnpublish,
  publicationError,
  onShowRejectedField,
  activeView = 'design',
  onViewChange,
  onOpenHistory,
}: TopBarProps) {
  const t = useTranslations();
  const page = useEditorStore((s) => s.page);
  const deviceMode = useEditorStore((s) => s.deviceMode);
  const setDeviceMode = useEditorStore((s) => s.setDeviceMode);
  const isSaved = useEditorStore((s) => s.isSaved);
  const presence = useEditorStore((s) => s.presence);
  const myUserId = useEditorStore((s) => s.myUserId);
  const presentUsers = useMemo(() => uniquePresenceUsers(presence), [presence]);
  const someoneElseHere = presentUsers.some((u) => u.userId !== myUserId);
  const [isSaving, setIsSaving] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showVersionInput, setShowVersionInput] = useState(false);
  const [versionLabel, setVersionLabel] = useState('');
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [versionToast, setVersionToast] = useState<string | null>(null);
  const [showPublishMenu, setShowPublishMenu] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const publishMenuRef = useRef<HTMLDivElement>(null);
  const leave = useLeaveEditor('/dashboard');
  const {
    isOwner, isPublishing, isUnpublishing, publishedPath, publish, unpublish, dismissPublished,
  } = usePublishActions({ onPublish, onUnpublish, publicationError });

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    const ok = await onSave();
    setIsSaving(false);
    if (ok) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        useEditorStore.setState({ isSaved: false });
      }, 2000);
    }
  }, [onSave]);

  const showVersionToast = useCallback((message: string) => {
    setVersionToast(message);
    setTimeout(() => setVersionToast(null), 4000);
  }, []);

  const handleSaveVersion = useCallback(async () => {
    if (page.id.startsWith('page_')) return;
    setIsSavingVersion(true);
    try {
      // The version is a copy of the server's page: it must have what is on screen (QA-037)
      if (!(await flushPendingSave())) {
        showVersionToast(t('saveStatus.versionNeedsSave'));
        return;
      }
      const v = await api.versions.create(page.id, versionLabel);
      showVersionToast(t('editor.saveVersionSuccess', { number: v.version_number }));
      setShowVersionInput(false);
      setVersionLabel('');
    } catch (e) {
      showVersionToast(apiErrorMessage(e, t, 'editor.saveVersionError'));
    } finally {
      setIsSavingVersion(false);
    }
  }, [page.id, showVersionToast, t, versionLabel]);

  // The publish menu closes on Escape and on a click outside it
  useEffect(() => {
    if (!showPublishMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowPublishMenu(false); };
    const onPointer = (e: PointerEvent) => {
      if (publishMenuRef.current && !publishMenuRef.current.contains(e.target as Node)) setShowPublishMenu(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [showPublishMenu]);

  const isPublished = page.status === 'published';
  const ownerOnlyId = 'topbar-owner-only-note';

  return (
    <header className="min-h-14 lg:h-14 flex-wrap lg:flex-nowrap gap-y-1 max-lg:py-1 bg-surface-card/80 backdrop-blur-2xl border-b border-default/15 shadow-2xl shadow-black/40 in-data-[theme=light]:shadow-sm in-data-[theme=light]:shadow-black/5 flex items-center justify-between px-2 xl:px-4 shrink-0 z-30">
      <div className="flex items-center gap-2 xl:gap-4 flex-1 min-w-0 overflow-hidden">
        <a
          href="/dashboard"
          onClick={leave.onLinkClick}
          aria-label={t('editor.goToDashboard')}
          aria-busy={leave.isLeaving || undefined}
          className="text-base font-black tracking-tighter hover:opacity-80 transition-opacity shrink-0 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:items-center"
          style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
        >
          {t('common.brand')}
        </a>
        <div className="flex items-center gap-2 min-w-0 whitespace-nowrap">
          <span className="font-medium text-sm text-primary tracking-wide truncate min-w-12 max-w-[16rem]" title={page.name}>{page.name}</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 border ${
              !isPublished
                ? 'bg-surface-elevated text-secondary border-default/30'
                : page.hasUnpublishedChanges
                  ? 'bg-warning/10 text-warning border-warning/30'
                  : 'bg-success/10 text-success border-success/30'
            }`}
          >
            {!isPublished
              ? t('common.draft')
              : page.hasUnpublishedChanges ? t('editor.unpublishedChanges') : t('common.published')}
          </span>
          <SaveStatusIndicator
            onRetry={() => { void onSave(); }}
            onShowField={(field) => onShowRejectedField?.(field)}
          />
          <span className="shrink-0">
            <ConnectionIndicator />
          </span>
        </div>
      </div>

      {/* Below lg the view and device switchers get their own row, so nothing overlaps (QA-083) */}
      <div className="flex items-center gap-3 max-lg:order-last max-lg:w-full max-lg:justify-center">
        {/* Editor view: plain toggle buttons, one pressed (QA-088) */}
        {onViewChange && (
          <div role="group" aria-label={t('editor.currentView')} className="flex items-center bg-surface-elevated/80 backdrop-blur-sm border border-default/10 p-1 rounded-full shadow-inner">
            {VIEW_BUTTONS.map(({ view, labelKey, Icon }) => (
              <button
                key={view}
                type="button"
                aria-pressed={activeView === view}
                aria-label={t(labelKey)}
                onClick={() => onViewChange(view)}
                title={t(labelKey)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${TOUCH_TARGET} ${
                  activeView === view
                    ? 'bg-surface-card text-primary shadow-sm'
                    : 'text-muted hover:text-secondary hover:bg-surface-card/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {/* Labels only on very wide screens: the page name and the connection status need the room (COLLAB2-002) */}
                <span className="hidden 2xl:inline" aria-hidden="true">{t(labelKey)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Device mode (only visible in design view) */}
        {(activeView === 'design' || activeView === 'styles') && (
          <div className="flex items-center bg-surface-elevated/80 backdrop-blur-sm border border-default/10 p-1 rounded-full shadow-inner">
            <button
              aria-label={t('editor.desktopView')}
              aria-pressed={deviceMode === 'desktop'}
              onClick={() => setDeviceMode('desktop')}
              className={`p-1.5 rounded-full transition-all duration-200 flex items-center ${TOUCH_TARGET} ${
                deviceMode === 'desktop'
                  ? 'bg-surface-card text-primary shadow-sm'
                  : 'text-muted hover:text-secondary hover:bg-surface-card/50'
              }`}
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              aria-label={t('editor.tabletView')}
              aria-pressed={deviceMode === 'tablet'}
              onClick={() => setDeviceMode('tablet')}
              className={`p-1.5 rounded-full transition-all duration-200 flex items-center ${TOUCH_TARGET} ${
                deviceMode === 'tablet'
                  ? 'bg-surface-card text-primary shadow-sm'
                  : 'text-muted hover:text-secondary hover:bg-surface-card/50'
              }`}
            >
              <Tablet className="w-4 h-4" />
            </button>
            <button
              aria-label={t('editor.mobileView')}
              aria-pressed={deviceMode === 'mobile'}
              onClick={() => setDeviceMode('mobile')}
              className={`p-1.5 rounded-full transition-all duration-200 flex items-center ${TOUCH_TARGET} ${
                deviceMode === 'mobile'
                  ? 'bg-surface-card text-primary shadow-sm'
                  : 'text-muted hover:text-secondary hover:bg-surface-card/50'
              }`}
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-1.5 xl:gap-3 shrink-0">
        {someoneElseHere && (
          <PresenceAvatars users={presentUsers} />
        )}
        {!page.id.startsWith('page_') && (
          <>
            {/* Save version inline */}
            {showVersionInput ? (
              <div className="flex items-center gap-1 bg-surface-elevated border border-default/20 rounded-lg px-2 py-1">
                <input
                  autoFocus
                  value={versionLabel}
                  onChange={(e) => setVersionLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveVersion();
                    if (e.key === 'Escape') { setShowVersionInput(false); setVersionLabel(''); }
                  }}
                  placeholder={t('editor.versionPlaceholder')}
                  aria-label={t('editor.versionPlaceholder')}
                  maxLength={200}
                  className="bg-transparent text-xs text-primary placeholder-muted outline-none w-36"
                />
                <button
                  onClick={handleSaveVersion}
                  disabled={isSavingVersion}
                  aria-label={t('editor.confirmVersion')}
                  className={`text-primary-color hover:text-primary-color/80 p-0.5 flex items-center ${TOUCH_TARGET}`}
                  title={t('editor.confirmVersion')}
                >
                  {isSavingVersion ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => { setShowVersionInput(false); setVersionLabel(''); }}
                  aria-label={t('common.cancel')}
                  className={`text-muted hover:text-secondary p-0.5 flex items-center ${TOUCH_TARGET}`}
                  title={t('common.cancel')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowVersionInput(true)}
                aria-label={t('editor.saveVersion')}
                className={`text-sm font-medium flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors text-secondary hover:text-primary hover:bg-surface-card/50 ${TOUCH_TARGET}`}
                title={t('editor.saveVersion')}
              >
                {/* Not the save icon: a version is a named copy, not a save (EDITOR2-009) */}
                <BookmarkPlus className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            {/* History button */}
            {onOpenHistory && (
              <button
                onClick={onOpenHistory}
                aria-label={t('editor.versionHistory')}
                className={`text-sm font-medium flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors text-secondary hover:text-primary hover:bg-surface-card/50 ${TOUCH_TARGET}`}
                title={t('editor.versionHistory')}
              >
                <History className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setShowShareModal(true)}
              aria-label={t('editor.share')}
              className={`text-sm font-medium flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors hover:bg-surface-card/50 text-secondary hover:text-primary ${TOUCH_TARGET}`}
              title={t('editor.share')}
            >
              <Share2 className="w-4 h-4" />
            </button>
          </>
        )}
        {/* Version toast */}
        {versionToast && (
          <div role="status" className="absolute top-14 sm:top-16 right-2 sm:right-4 bg-surface-elevated border border-default text-primary text-xs px-3 py-2 rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-top-2">
            {versionToast}
          </div>
        )}
        {isPublished && page.slug && (
          <button
            onClick={() => window.open(`/p/${page.slug}`, '_blank')}
            className={`text-sm font-medium flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-primary-color hover:text-primary-color/80 hover:bg-primary/10 ${TOUCH_TARGET}`}
            title={t('editor.viewPublished')}
            aria-label={t('editor.viewPublished')}
          >
            <Globe className="w-4 h-4" />
            <span className="hidden 2xl:inline">{t('editor.viewPublished')}</span>
          </button>
        )}
        <button
          onClick={async () => {
            await handleSave();
            window.open(`/preview/${page.id}`, '_blank');
          }}
          className={`text-sm font-medium flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-secondary hover:text-primary hover:bg-surface-card/50 ${TOUCH_TARGET}`}
          title={t('editor.previewTitle')}
          aria-label={t('editor.previewTitle')}
        >
          <Eye className="w-4 h-4" />
          <span className="hidden 2xl:inline">{t('editor.previewTitle')}</span>
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`text-sm font-medium text-secondary hover:text-primary flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-surface-card/50 transition-colors disabled:opacity-50 ${TOUCH_TARGET}`}
          title={isSaving ? t('editor.saveTooltipSaving') : isSaved ? t('editor.saveTooltipSaved') : t('editor.saveTooltipDefault')}
          aria-label={isSaving ? t('editor.saveTooltipSaving') : isSaved ? t('editor.saveTooltipSaved') : t('editor.saveTooltipDefault')}
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isSaved ? (
            <CheckCircle2 className="w-4 h-4 text-primary-color" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span className="hidden 2xl:inline">{isSaving ? t('editor.saveTooltipSaving') : isSaved ? t('editor.saveTooltipSaved') : t('editor.saveTooltipDefault')}</span>
        </button>
        <div className="hidden xl:flex items-center gap-1">
          <ThemeToggle />
          <LocaleSwitcher />
        </div>

        {/* Publish: owner only (D1); for others the button explains why it does nothing */}
        <div ref={publishMenuRef} className="relative flex items-center">
          {!isOwner && <span id={ownerOnlyId} className="sr-only">{t('publishing.ownerOnly')}</span>}
          <button
            onClick={publish}
            disabled={isPublishing}
            aria-disabled={!isOwner || undefined}
            aria-describedby={!isOwner ? ownerOnlyId : undefined}
            title={!isOwner ? t('publishing.ownerOnly') : undefined}
            className={`text-white text-sm font-bold px-3 xl:px-4 py-1.5 pointer-coarse:min-h-11 shadow-lg transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap ${
              isOwner && isPublished && onUnpublish ? 'rounded-l-md' : 'rounded-md'
            } ${!isOwner ? 'opacity-50 cursor-not-allowed active:scale-100' : ''}`}
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
          >
            {isPublishing
              ? t('editor.publishLoading')
              : isPublished && page.hasUnpublishedChanges ? t('editor.publishChanges') : t('editor.publishPage')}
          </button>
          {isOwner && isPublished && onUnpublish && (
            <button
              type="button"
              onClick={() => setShowPublishMenu((open) => !open)}
              aria-expanded={showPublishMenu}
              aria-controls="publish-menu"
              aria-label={t('publishing.moreOptions')}
              title={t('publishing.moreOptions')}
              className={`text-white py-1.5 px-1.5 rounded-r-md border-l border-white/30 shadow-lg flex items-center ${TOUCH_TARGET}`}
              style={{ background: '#2563EB' }}
            >
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          {showPublishMenu && (
            <div
              id="publish-menu"
              className="absolute right-0 top-full mt-2 w-56 bg-surface-elevated border border-default/20 rounded-lg shadow-xl p-1 z-50"
            >
              <button
                type="button"
                onClick={() => { setShowPublishMenu(false); setConfirmUnpublish(true); }}
                disabled={isUnpublishing}
                className="w-full text-left text-sm text-primary px-3 py-2 rounded-md hover:bg-surface-card focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-50"
              >
                {isUnpublishing ? t('publishing.unpublishing') : t('publishing.unpublish')}
              </button>
            </div>
          )}
          {publishedPath && (
            <div
              role="status"
              className="absolute right-0 top-full mt-2 w-72 bg-surface-elevated border border-success/40 rounded-lg shadow-xl p-3 z-50 text-xs text-primary flex items-start gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1 min-w-0 space-y-1">
                <p>{t('publishing.publishedAt')}</p>
                <a
                  href={publishedPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary-color hover:underline break-all"
                >
                  {publishedPath}
                  <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span className="sr-only">{t('publishing.opensInNewTab')}</span>
                </a>
              </div>
              <button
                type="button"
                onClick={dismissPublished}
                aria-label={t('common.close')}
                className="text-muted hover:text-primary p-1 -m-1 rounded"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>

      {showShareModal && !page.id.startsWith('page_') && (
        <ShareModal pageId={page.id} onClose={() => setShowShareModal(false)} />
      )}

      <ConfirmDialog
        open={confirmUnpublish}
        title={t('publishing.unpublishTitle')}
        message={t('publishing.unpublishMessage')}
        confirmLabel={t('publishing.unpublish')}
        variant="danger"
        onConfirm={() => { setConfirmUnpublish(false); void unpublish(); }}
        onCancel={() => setConfirmUnpublish(false)}
      />
      <ConfirmDialog
        open={leave.confirmOpen}
        title={t('saveStatus.leaveTitle')}
        message={t('saveStatus.leaveMessage')}
        confirmLabel={t('saveStatus.leaveAnyway')}
        cancelLabel={t('saveStatus.stay')}
        variant="danger"
        onConfirm={leave.leaveAnyway}
        onCancel={leave.stay}
      />
    </header>
  );
}

function PresenceAvatars({ users }: { users: PresenceEntry[] }) {
  const maxShow = 4;
  const visible = users.slice(0, maxShow);
  const overflow = users.length - maxShow;

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((user) => {
        const color = getUserColor(user.userId);
        return (
          <div
            key={user.userId}
            role="img"
            aria-label={user.username}
            className="w-7 h-7 rounded-full border-2 border-surface flex items-center justify-center text-[10px] font-bold text-white ring-1 ring-white/10"
            style={{ backgroundColor: color.hex }}
            title={user.username}
          >
            {presenceInitials(user.username)}
          </div>
        );
      })}
      {overflow > 0 && (
        <div className="w-7 h-7 rounded-full border-2 border-surface bg-surface-card flex items-center justify-center text-[10px] font-bold text-secondary">
          +{overflow}
        </div>
      )}
    </div>
  );
}
