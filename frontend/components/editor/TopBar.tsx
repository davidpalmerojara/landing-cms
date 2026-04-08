'use client';

import { useCallback, useRef, useState } from 'react';
import {
  Monitor, Smartphone, Tablet,
  Eye, Save, CheckCircle2,
  RotateCcw, AlertCircle,
  Loader2, Globe, Share2, BarChart3, Search,
  Pencil, History, X, Check, Palette,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import ShareModal from './ShareModal';
import { useEditorStore, getUserColor } from '@/store/editor-store';
import type { CollabUser } from '@/store/editor-store';
import ThemeSelector from './ThemeSelector';
import ThemeToggle from '@/components/ui/ThemeToggle';
import LocaleSwitcher from '@/components/ui/LocaleSwitcher';
import { api } from '@/lib/api';

type EditorView = 'design' | 'styles' | 'seo' | 'analytics';

interface TopBarProps {
  onSave: () => Promise<boolean>;
  onPublish: () => Promise<boolean>;
  apiError: string | null;
  activeView?: EditorView;
  onViewChange?: (view: EditorView) => void;
  onOpenHistory?: () => void;
}

export default function TopBar({ onSave, onPublish, apiError, activeView = 'design', onViewChange, onOpenHistory }: TopBarProps) {
  const t = useTranslations();
  const page = useEditorStore((s) => s.page);
  const deviceMode = useEditorStore((s) => s.deviceMode);
  const setDeviceMode = useEditorStore((s) => s.setDeviceMode);
  const isSaved = useEditorStore((s) => s.isSaved);
  const resetDemo = useEditorStore((s) => s.resetDemo);
  const autoSaveStatus = useEditorStore((s) => s.autoSaveStatus);
  const connectedUsers = useEditorStore((s) => s.connectedUsers);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showVersionInput, setShowVersionInput] = useState(false);
  const [versionLabel, setVersionLabel] = useState('');
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [versionToast, setVersionToast] = useState<string | null>(null);

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

  const handlePublish = useCallback(async () => {
    setIsPublishing(true);
    await onPublish();
    setIsPublishing(false);
  }, [onPublish]);

  const handleSaveVersion = useCallback(async () => {
    if (page.id.startsWith('page_')) return;
    setIsSavingVersion(true);
    try {
      const v = await api.versions.create(page.id, versionLabel);
      setVersionToast(t('editor.saveVersionSuccess', { number: v.version_number }));
      setShowVersionInput(false);
      setVersionLabel('');
      setTimeout(() => setVersionToast(null), 3000);
    } catch {
      setVersionToast(t('editor.saveVersionError'));
      setTimeout(() => setVersionToast(null), 3000);
    } finally {
      setIsSavingVersion(false);
    }
  }, [page.id, t, versionLabel]);

  const handleResetDemo = useCallback(() => {
    if (window.confirm(t('editor.resetDemoConfirm'))) {
      localStorage.removeItem('landing_builder_page');
      resetDemo();
    }
  }, [resetDemo, t]);

  return (
    <header className="h-14 bg-surface-card\/80 backdrop-blur-2xl border-b border-default/15 shadow-2xl shadow-black/40 flex items-center justify-between px-2 xl:px-4 shrink-0 z-30">
      <div className="flex items-center gap-2 xl:gap-4 flex-1 min-w-0 overflow-hidden">
        <a href="/dashboard" aria-label={t('editor.goToDashboard')} className="text-base font-black tracking-tighter hover:opacity-80 transition-opacity" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {t('common.brand')}
        </a>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-primary tracking-wide truncate">{page.name}</span>
            <span
              className={`text-[9px] w-5 h-5 rounded-full font-bold flex items-center justify-center shrink-0 ${
                page.status === 'published'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
              }`}
              title={page.status === 'published' ? t('common.published') : t('common.draft')}
            >
              {page.status === 'published' ? t('editor.statusPublishedShort') : t('editor.statusDraftShort')}
            </span>
            <span aria-live="polite">
              {autoSaveStatus === 'saving' && (
                <span className="flex items-center gap-1 text-secondary text-[10px]">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t('common.saving')}
                </span>
              )}
              {autoSaveStatus === 'saved' && (
                <span className="flex items-center gap-1 text-primary-color text-[10px]">
                  <CheckCircle2 className="w-3 h-3" />
                  {t('common.saved')}
                </span>
              )}
              {autoSaveStatus === 'error' && (
                <span className="flex items-center gap-1 text-red-400 text-[10px]">
                  <AlertCircle className="w-3 h-3" />
                  {t('editor.saveError')}
                </span>
              )}
            </span>
            {apiError && (
              <span className="flex items-center gap-1 text-red-400 text-[10px]" title={apiError}>
                <AlertCircle className="w-3 h-3" />
                {t('editor.offline')}
              </span>
            )}
            <button
              onClick={handleResetDemo}
              aria-label={t('editor.resetDemo')}
              className="ml-2 text-muted hover:text-red-400 p-1 rounded hover:bg-surface-card\/50 transition-colors"
              title={t('editor.resetDemo')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* View toggle: Design / Analytics */}
        {onViewChange && (
          <div role="radiogroup" aria-label={t('editor.currentView')} className="flex items-center bg-surface-elevated\/80 backdrop-blur-sm border border-default/10 p-1 rounded-full shadow-inner">
            <button
              role="radio"
              aria-checked={activeView === 'design'}
              onClick={() => onViewChange('design')}
              title={t('editor.viewDesign')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                activeView === 'design'
                  ? 'bg-surface-card text-primary shadow-sm'
                  : 'text-muted hover:text-secondary hover:bg-surface-card\/50'
              }`}
            >
              <Pencil className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{t('editor.viewDesign')}</span>
            </button>
            <button
              role="radio"
              aria-checked={activeView === 'styles'}
              onClick={() => onViewChange('styles')}
              title={t('editor.viewStyles')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                activeView === 'styles'
                  ? 'bg-surface-card text-primary shadow-sm'
                  : 'text-muted hover:text-secondary hover:bg-surface-card\/50'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{t('editor.viewStyles')}</span>
            </button>
            <button
              role="radio"
              aria-checked={activeView === 'seo'}
              onClick={() => onViewChange('seo')}
              title={t('editor.viewSeo')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                activeView === 'seo'
                  ? 'bg-surface-card text-primary shadow-sm'
                  : 'text-muted hover:text-secondary hover:bg-surface-card\/50'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{t('editor.viewSeo')}</span>
            </button>
            <button
              role="radio"
              aria-checked={activeView === 'analytics'}
              onClick={() => onViewChange('analytics')}
              title={t('editor.viewAnalytics')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                activeView === 'analytics'
                  ? 'bg-surface-card text-primary shadow-sm'
                  : 'text-muted hover:text-secondary hover:bg-surface-card\/50'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{t('editor.viewAnalytics')}</span>
            </button>
          </div>
        )}

        {/* Device mode (only visible in design view) */}
        {(activeView === 'design' || activeView === 'styles') && (
          <div className="flex items-center bg-surface-elevated\/80 backdrop-blur-sm border border-default/10 p-1 rounded-full shadow-inner">
            <button
              aria-label={t('editor.desktopView')}
              aria-pressed={deviceMode === 'desktop'}
              onClick={() => setDeviceMode('desktop')}
              className={`p-1.5 rounded-full transition-all duration-200 ${
                deviceMode === 'desktop'
                  ? 'bg-surface-card text-primary shadow-sm'
                  : 'text-muted hover:text-secondary hover:bg-surface-card\/50'
              }`}
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              aria-label={t('editor.tabletView')}
              aria-pressed={deviceMode === 'tablet'}
              onClick={() => setDeviceMode('tablet')}
              className={`p-1.5 rounded-full transition-all duration-200 ${
                deviceMode === 'tablet'
                  ? 'bg-surface-card text-primary shadow-sm'
                  : 'text-muted hover:text-secondary hover:bg-surface-card\/50'
              }`}
            >
              <Tablet className="w-4 h-4" />
            </button>
            <button
              aria-label={t('editor.mobileView')}
              aria-pressed={deviceMode === 'mobile'}
              onClick={() => setDeviceMode('mobile')}
              className={`p-1.5 rounded-full transition-all duration-200 ${
                deviceMode === 'mobile'
                  ? 'bg-surface-card text-primary shadow-sm'
                  : 'text-muted hover:text-secondary hover:bg-surface-card\/50'
              }`}
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-1.5 xl:gap-3 shrink-0">
        {connectedUsers.length > 1 && (
          <PresenceAvatars users={connectedUsers} />
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
                  className="bg-transparent text-xs text-primary placeholder-muted outline-none w-36"
                />
                <button
                  onClick={handleSaveVersion}
                  disabled={isSavingVersion}
                  aria-label={t('editor.confirmVersion')}
                  className="text-primary-color hover:text-primary-color/80 p-0.5"
                  title={t('editor.confirmVersion')}
                >
                  {isSavingVersion ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => { setShowVersionInput(false); setVersionLabel(''); }}
                  aria-label={t('common.cancel')}
                  className="text-muted hover:text-secondary p-0.5"
                  title={t('common.cancel')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowVersionInput(true)}
                aria-label={t('editor.saveVersion')}
                className="text-sm font-medium flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors text-secondary hover:text-primary hover:bg-surface-card\/50"
                title={t('editor.saveVersion')}
              >
                <Save className="w-4 h-4" />
              </button>
            )}
            {/* History button */}
            {onOpenHistory && (
              <button
                onClick={onOpenHistory}
                aria-label={t('editor.versionHistory')}
                className="text-sm font-medium flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors text-secondary hover:text-primary hover:bg-surface-card\/50"
                title={t('editor.versionHistory')}
              >
                <History className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setShowShareModal(true)}
              aria-label={t('editor.share')}
              className="text-sm font-medium flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors text-secondary hover:text-primary hover:bg-surface-card\/50"
              title={t('editor.share')}
            >
              <Share2 className="w-4 h-4" />
            </button>
          </>
        )}
        <ThemeSelector />
        {/* Version toast */}
        {versionToast && (
          <div className="absolute top-14 sm:top-16 right-2 sm:right-4 bg-surface-elevated border border-default text-primary text-xs px-3 py-2 rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-top-2">
            {versionToast}
          </div>
        )}
        {page.status === 'published' && page.slug && (
          <button
            onClick={() => window.open(`/p/${page.slug}`, '_blank')}
            className="text-sm font-medium hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-primary-color hover:text-primary-color/80 hover:bg-primary\/10"
            title={t('editor.viewPublished')}
          >
            <Globe className="w-4 h-4" />
            {t('editor.viewPublished')}
          </button>
        )}
        <button
          onClick={async () => {
            await handleSave();
            window.open(`/preview/${page.id}`, '_blank');
          }}
          className="text-sm font-medium flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-secondary hover:text-primary hover:bg-surface-card\/50"
          title={t('editor.previewTitle')}
        >
          <Eye className="w-4 h-4" />
          <span className="hidden xl:inline">{t('editor.previewTitle')}</span>
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="text-sm font-medium text-secondary hover:text-primary flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-surface-card\/50 transition-colors disabled:opacity-50"
          title={isSaving ? t('editor.saveTooltipSaving') : isSaved ? t('editor.saveTooltipSaved') : t('editor.saveTooltipDefault')}
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isSaved ? (
            <CheckCircle2 className="w-4 h-4 text-primary-color" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span className="hidden xl:inline">{isSaving ? t('editor.saveTooltipSaving') : isSaved ? t('editor.saveTooltipSaved') : t('editor.saveTooltipDefault')}</span>
        </button>
        <div className="hidden xl:flex items-center gap-1">
          <ThemeToggle />
          <LocaleSwitcher />
        </div>
        <button
          onClick={handlePublish}
          disabled={isPublishing}
          className="text-white text-sm font-bold px-3 xl:px-4 py-1.5 rounded-md shadow-lg transition-all active:scale-95 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
        >
          {isPublishing ? t('editor.publishLoading') : t('editor.publishPage')}
        </button>
      </div>

      {showShareModal && !page.id.startsWith('page_') && (
        <ShareModal pageId={page.id} onClose={() => setShowShareModal(false)} />
      )}
    </header>
  );
}

function PresenceAvatars({ users }: { users: CollabUser[] }) {
  const maxShow = 4;
  const visible = users.slice(0, maxShow);
  const overflow = users.length - maxShow;

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((user) => {
        const color = getUserColor(user.id);
        return (
          <div
            key={user.id}
            className="w-7 h-7 rounded-full border-2 border-surface flex items-center justify-center text-[10px] font-bold text-white ring-1 ring-white/10"
            style={{ backgroundColor: color.hex }}
            title={user.username}
          >
            {user.avatar ? (
              <img src={user.avatar} alt={user.username} className="w-full h-full rounded-full object-cover" />
            ) : (
              user.username.charAt(0).toUpperCase()
            )}
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
