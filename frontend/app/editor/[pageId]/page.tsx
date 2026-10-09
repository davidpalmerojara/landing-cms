'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import TopBar from '@/components/editor/TopBar';
import LeftSidebar from '@/components/editor/LeftSidebar';
import CanvasViewport from '@/components/editor/CanvasViewport';
import DragOverlay from '@/components/editor/DragOverlay';
import Inspector from '@/components/inspector/Inspector';
import VersionHistoryPanel from '@/components/editor/VersionHistoryPanel';
import VersionPreviewModal from '@/components/editor/VersionPreviewModal';
import SeoPanel from '@/components/editor/SeoPanel';
import DesignTokensPanel from '@/components/editor/DesignTokensPanel';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { ToastContainer } from '@/components/ui/Toast';
import AnalyticsPanel from '@/components/analytics/AnalyticsPanel';
import SubmissionsPanel from '@/components/editor/SubmissionsPanel';
import MobileEditor from '@/components/mobile-editor/MobileEditor';
import AccessRevokedBanner from '@/components/editor/AccessRevokedBanner';
import { useEditorStore } from '@/store/editor-store';
import { useEditorShortcuts } from '@/hooks/useEditorShortcuts';
import { useIsQuickEditMode } from '@/hooks/useIsQuickEditMode';
import { usePageSync } from '@/hooks/usePageSync';
import { useDragManager } from '@/hooks/useDragManager';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useCollaboration } from '@/hooks/useCollaboration';
import { useAuth } from '@/hooks/useAuth';
import GuestSessionProvider from '@/components/guest/GuestSessionProvider';
import GuestBanner from '@/components/guest/GuestBanner';

type EditorView = 'design' | 'styles' | 'seo' | 'analytics' | 'messages';

export default function EditorPage() {
  const t = useTranslations();
  const params = useParams();
  const pageId = params.pageId as string;
  const isQuickEditMode = useIsQuickEditMode();
  const { user, setUser, isLoading: isAuthLoading } = useAuth({ redirectTo: `/login?next=${encodeURIComponent(`/editor/${pageId}`)}` });
  const [activeView, setActiveView] = useState<EditorView>('design');
  const [showHistory, setShowHistory] = useState(false);
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);

  const isPreviewMode = useEditorStore((s) => s.isPreviewMode);
  const pendingDeleteBlockId = useEditorStore((s) => s.pendingDeleteBlockId);
  const cancelDeleteBlock = useEditorStore((s) => s.cancelDeleteBlock);
  const confirmDeleteBlock = useEditorStore((s) => s.confirmDeleteBlock);
  const page = useEditorStore((s) => s.page);
  const toasts = useEditorStore((s) => s.toasts);
  const removeToast = useEditorStore((s) => s.removeToast);
  const addToast = useEditorStore((s) => s.addToast);
  const setMyUserId = useEditorStore((s) => s.setMyUserId);
  // Who is editing: tells owner-only actions apart and colors this person's selection
  useEffect(() => {
    if (user) setMyUserId(user.id);
  }, [user, setMyUserId]);
  useEditorShortcuts();
  const { isLoading, error, saveError, saveToApi, publishToApi, restoreVersion, handleRemoteChange } = usePageSync(pageId, {
    onRemoteMerged: (change) => {
      // A restore by someone else (not by this person in another tab) is worth a notice
      if (change.reason === 'restore' && change.by && change.by.userId !== useEditorStore.getState().myUserId) {
        addToast(t('collab.restoredByCollaborator', { name: change.by.username }), 'info');
      }
    },
    onSaveFailed: (kind) => {
      if (kind === 'conflict') addToast(t('collab.saveConflict'), 'error');
    },
  });
  useDragManager();
  useAutoSave(saveToApi);
  const { sendCursorMove } = useCollaboration(pageId, { onRemoteChange: handleRemoteChange });

  const handleRestore = async (versionId: string) => {
    try {
      // The whole restored page (blocks, theme, tokens, SEO) replaces the editor's
      await restoreVersion(versionId);
      setShowHistory(false);
      setPreviewVersionId(null);
      addToast(t('editor.restoreVersionSuccess'), 'success');
    } catch (e) {
      addToast(t('editor.restoreVersionError'), 'error');
      if (process.env.NODE_ENV === 'development') console.error('Failed to restore version:', e);
    }
  };

  const handlePreviewVersion = (versionId: string) => {
    setPreviewVersionId(versionId);
  };

  if (isLoading || isAuthLoading || !user) {
    return (
      <div className="flex items-center justify-center h-dvh bg-surface text-secondary">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">{t('editor.loadingPage')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    const is404 = error.includes('404');
    return (
      <div className="flex items-center justify-center h-dvh bg-surface text-secondary">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <div className="w-14 h-14 bg-surface-card border border-default/15 rounded-2xl flex items-center justify-center mb-2">
            <span className="text-2xl">{is404 ? '🔍' : '⚠️'}</span>
          </div>
          <h2 className="text-lg font-bold text-primary">
            {is404 ? t('editor.pageNotFoundTitle') : t('editor.loadErrorTitle')}
          </h2>
          <p className="text-sm text-muted">
            {is404
              ? t('editor.pageNotFoundDescription')
              : error}
          </p>
          <a
            href="/dashboard"
            className="mt-4 px-6 py-2.5 rounded-full text-black text-sm font-bold transition-all active:scale-95"
            style={{ background: 'linear-gradient(to right, #2563EB, #2563EB)' }}
          >
            {t('editor.goToDashboard')}
          </a>
        </div>
      </div>
    );
  }

  // --- Quick Edit Mode (mobile) ---
  if (isQuickEditMode) {
    return (
      <GuestSessionProvider user={user} onClaimed={setUser}>
        <MobileEditor pageId={pageId} onSave={saveToApi} onPublish={publishToApi} />
        <ConfirmDialog
          open={pendingDeleteBlockId !== null}
          title={t('editor.deleteBlockTitle')}
          message={t('editor.deleteBlockMessage', { name: page.blocks.find((b) => b.id === pendingDeleteBlockId)?.name || t('editor.components') })}
          confirmLabel={t('common.delete')}
          variant="danger"
          onConfirm={confirmDeleteBlock}
          onCancel={cancelDeleteBlock}
        />
        <ToastContainer toasts={toasts} onDismiss={removeToast} />
      </GuestSessionProvider>
    );
  }

  // --- Desktop editor ---
  return (
    <GuestSessionProvider user={user} onClaimed={setUser}>
    <div
      className="flex flex-col h-dvh bg-surface font-sans text-secondary overflow-hidden outline-none"
      tabIndex={0}
    >
      <GuestBanner />
      <AccessRevokedBanner />
      <TopBar
        onSave={saveToApi}
        onPublish={publishToApi}
        apiError={saveError}
        activeView={activeView}
        onViewChange={setActiveView}
        onOpenHistory={() => setShowHistory((v) => !v)}
      />

      {activeView === 'analytics' ? (
        <main className="flex-1 overflow-hidden">
          <AnalyticsPanel pageId={pageId} pageStatus={page.status} />
        </main>
      ) : activeView === 'messages' ? (
        <main className="flex flex-1 overflow-hidden">
          <SubmissionsPanel pageId={pageId} />
        </main>
      ) : (
        <>
          <main className="flex flex-1 overflow-hidden relative">
            {!isPreviewMode && activeView === 'design' && <LeftSidebar />}
            <CanvasViewport onCursorMove={sendCursorMove} />
            {activeView === 'seo' && <SeoPanel />}
            {activeView === 'styles' && <DesignTokensPanel />}
            {activeView === 'design' && !isPreviewMode && !showHistory && <Inspector />}
            {activeView === 'design' && showHistory && (
              <VersionHistoryPanel
                pageId={pageId}
                onClose={() => setShowHistory(false)}
                onPreview={handlePreviewVersion}
                onRestore={handleRestore}
              />
            )}
          </main>
          <DragOverlay />
        </>
      )}

      <ConfirmDialog
        open={pendingDeleteBlockId !== null}
        title={t('editor.deleteBlockTitle')}
        message={t('editor.deleteBlockMessage', { name: page.blocks.find((b) => b.id === pendingDeleteBlockId)?.name || t('editor.components') })}
        confirmLabel={t('common.delete')}
        variant="danger"
        onConfirm={confirmDeleteBlock}
        onCancel={cancelDeleteBlock}
      />

      {previewVersionId && (
        <VersionPreviewModal
          pageId={pageId}
          versionId={previewVersionId}
          onClose={() => setPreviewVersionId(null)}
          onRestore={handleRestore}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
    </GuestSessionProvider>
  );
}
