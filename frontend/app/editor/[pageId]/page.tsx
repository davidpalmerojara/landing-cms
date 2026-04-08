'use client';

import { useState } from 'react';
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
import MobileEditor from '@/components/mobile-editor/MobileEditor';
import { useEditorStore } from '@/store/editor-store';
import { api } from '@/lib/api';
import { useEditorShortcuts } from '@/hooks/useEditorShortcuts';
import { useIsQuickEditMode } from '@/hooks/useIsQuickEditMode';
import { usePageSync } from '@/hooks/usePageSync';
import { useDragManager } from '@/hooks/useDragManager';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useCollaboration } from '@/hooks/useCollaboration';

type EditorView = 'design' | 'styles' | 'seo' | 'analytics';

export default function EditorPage() {
  const t = useTranslations();
  const params = useParams();
  const pageId = params.pageId as string;
  const isQuickEditMode = useIsQuickEditMode();
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
  useEditorShortcuts();
  const { isLoading, error, saveToApi, publishToApi } = usePageSync(pageId);
  useDragManager();
  useAutoSave(saveToApi);
  const { sendCursorMove } = useCollaboration(pageId);

  const handleRestore = async (versionId: string) => {
    try {
      await api.versions.restore(pageId, versionId, true);
      // Re-fetch from API to get fresh state
      const fresh = await api.pages.get(pageId);
      const { defaultBlockStyles } = await import('@/types/blocks');
      const { blockRegistry } = await import('@/lib/block-registry');
      const blocks = fresh.blocks
        .sort((a, b) => a.order - b.order)
        .map((b) => ({
          id: b.id,
          type: b.type,
          name: blockRegistry[b.type]?.label || b.type,
          data: b.data,
          styles: { ...defaultBlockStyles, ...b.styles },
        }));
      useEditorStore.setState({
        page: {
          ...useEditorStore.getState().page,
          name: fresh.name,
          blocks,
          status: fresh.status as 'draft' | 'published',
        },
      });
      setShowHistory(false);
      setPreviewVersionId(null);
    } catch {
      alert(t('editor.restoreVersionError'));
    }
  };

  const handlePreviewVersion = (versionId: string) => {
    setPreviewVersionId(versionId);
  };

  if (isLoading) {
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
          <h2 className="text-lg font-bold text-white">
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
      <>
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
      </>
    );
  }

  // --- Desktop editor ---
  return (
    <div
      className="flex flex-col h-dvh bg-surface font-sans text-secondary overflow-hidden outline-none"
      tabIndex={0}
    >
      <TopBar
        onSave={saveToApi}
        onPublish={publishToApi}
        apiError={error}
        activeView={activeView}
        onViewChange={setActiveView}
        onOpenHistory={() => setShowHistory((v) => !v)}
      />

      {activeView === 'analytics' ? (
        <main className="flex-1 overflow-hidden">
          <AnalyticsPanel pageId={pageId} pageStatus={page.status} />
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
  );
}
