'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import TopBar from '@/components/editor/TopBar';
import { SaveIssueBanner } from '@/components/editor/SaveStatusIndicator';
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
import AnalyticsPanelLoading from '@/components/analytics/AnalyticsPanelLoading';
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
import { getTranslatedBlockLabel } from '@/lib/block-i18n';
import { isMacPlatform } from '@/lib/keyboard';
import { inspectorInputId } from '@/lib/save-issue';
import type { RejectedField } from '@/lib/page-sync';

// Recharts weighs more than the rest of the editor together: it loads when the analytics tab opens
const AnalyticsPanel = dynamic(() => import('@/components/analytics/AnalyticsPanel'), {
  loading: () => <AnalyticsPanelLoading />,
});

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

  const undoShortcut = isMacPlatform() ? '⌘Z' : 'Ctrl+Z';
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
  const {
    isLoading, error, errorStatus, saveToApi, saveOnLeave, hasUnsavedChanges,
    publishToApi, unpublishToApi, lastPublicationError, restoreVersion, handleRemoteChange,
  } = usePageSync(pageId, {
    onRemoteMerged: (change) => {
      // Only changes by someone else (not by this person in another tab) are worth a notice
      if (!change.by || change.by.userId === useEditorStore.getState().myUserId) return;
      if (change.reason === 'restore') {
        addToast(t('collab.restoredByCollaborator', { name: change.by.username }), 'info');
      } else if (change.reason === 'publish') {
        const published = useEditorStore.getState().page.status === 'published';
        addToast(t(published ? 'publishing.publishedBy' : 'publishing.unpublishedBy', { name: change.by.username }), 'info');
      }
    },
    onSaveFailed: (kind) => {
      if (kind === 'conflict') addToast(t('collab.saveConflict'), 'error');
    },
    // A phone has no keyboard shortcut to undo with: the Undo button is the way (MOBILE2-006)
    onLocalChangesRecovered: () => addToast(
      isQuickEditMode ? t('mobile.recoveredChanges') : t('saveStatus.recovered', { undo: undoShortcut }),
      'info',
    ),
  });
  useDragManager();
  useAutoSave(saveToApi, { saveOnLeave, hasUnsavedChanges });
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

  // The tab says which page is open (QA-057); never the placeholder page's name while loading or when it failed (APP2-005)
  const failedTitle = error ? t(errorStatus === 404 ? 'editor.pageNotFoundTitle' : 'editor.loadErrorTitle') : null;
  const openPageName = !isLoading && page.id === pageId ? page.name : '';
  useEffect(() => {
    const shown = failedTitle ?? openPageName;
    if (shown) document.title = `${shown} — ${t('common.brand')}`;
  }, [failedTitle, openPageName, t]);

  /** Take the user to a field the server refused: its block selected, its input focused. */
  const showRejectedField = useCallback((field: RejectedField) => {
    if (field.blockId === null) {
      setActiveView('seo');
      return;
    }
    const store = useEditorStore.getState();
    setActiveView('design');
    setShowHistory(false);
    if (store.isPreviewMode) store.togglePreview();
    useEditorStore.setState((s) => ({ inspectorSections: { ...s.inspectorSections, content: true } }));
    store.selectBlock(field.blockId);
    const inputId = inspectorInputId(field.path);
    // After the inspector renders the block's fields
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const input = inputId ? document.getElementById(inputId) : null;
      const listToggle = field.path.length === 3
        ? document.querySelector<HTMLElement>(`[data-list-focus="toggle-${field.path[1]}"]`)
        : null;
      (input ?? listToggle)?.focus();
    }));
  }, []);

  const retrySave = useCallback(() => { void saveToApi(); }, [saveToApi]);

  const pendingDeleteBlock = page.blocks.find((b) => b.id === pendingDeleteBlockId);
  const deletedBlockName = pendingDeleteBlock ? getTranslatedBlockLabel(pendingDeleteBlock.type, t) : t('editor.components');
  const deleteBlockMessage = isQuickEditMode
    ? t('mobile.deleteBlockMessage', { name: deletedBlockName })
    : t('editor.deleteBlockMessage', { name: deletedBlockName, undo: undoShortcut });

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
    const is404 = errorStatus === 404;
    return (
      <div className="flex items-center justify-center h-dvh bg-surface text-secondary">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <div className="w-14 h-14 bg-surface-card border border-default/15 rounded-2xl flex items-center justify-center mb-2">
            <span className="text-2xl">{is404 ? '🔍' : '⚠️'}</span>
          </div>
          <h1 className="text-lg font-bold text-primary">
            {is404 ? t('editor.pageNotFoundTitle') : t('editor.loadErrorTitle')}
          </h1>
          <p className="text-sm text-muted">
            {is404
              ? t('editor.pageNotFoundDescription')
              : error}
          </p>
          <a
            href="/dashboard"
            className="mt-4 px-6 py-2.5 rounded-full text-white text-sm font-bold transition-all active:scale-95"
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
        <MobileEditor
          pageId={pageId}
          onSave={saveToApi}
          onPublish={publishToApi}
          onUnpublish={unpublishToApi}
          publicationError={lastPublicationError}
        />
        <ConfirmDialog
          open={pendingDeleteBlockId !== null}
          title={t('editor.deleteBlockTitle')}
          message={deleteBlockMessage}
          confirmLabel={t('common.delete')}
          variant="danger"
          onConfirm={confirmDeleteBlock}
          onCancel={cancelDeleteBlock}
        />
        <ToastContainer toasts={toasts} onDismiss={removeToast} placement="aboveFab" />
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
        onUnpublish={unpublishToApi}
        publicationError={lastPublicationError}
        onShowRejectedField={showRejectedField}
        activeView={activeView}
        onViewChange={setActiveView}
        onOpenHistory={() => setShowHistory((v) => !v)}
      />
      <SaveIssueBanner onRetry={retrySave} onShowField={showRejectedField} />

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
        message={deleteBlockMessage}
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
