'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Eye,
  Globe,
  Info,
  Layers,
  Plus,
  Redo2,
  Undo2,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEditorStore, lockHeldByOther } from '@/store/editor-store';
import { blockRegistry, getAvailableBlocks } from '@/lib/block-registry';
import { getTranslatedBlockLabel } from '@/lib/block-i18n';
import { getBlockDefaults } from '@/lib/block-defaults';
import { PAGE_FIELD_LIMITS } from '@/lib/field-limits';
import type { BlockType } from '@/types/blocks';
import type { ToastData } from '@/components/ui/Toast';
import AccessRevokedBanner from '@/components/editor/AccessRevokedBanner';
import GuestBanner from '@/components/guest/GuestBanner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useLeaveEditor } from '@/hooks/useLeaveEditor';
import { useSaveIssueText } from '@/hooks/useSaveIssueText';
import { useTouchReorder } from '@/hooks/useTouchReorder';
import { useCloseOnBack } from '@/hooks/useCloseOnBack';
import MobileBlockCard from './MobileBlockCard';
import MobileBottomSheet from './MobileBottomSheet';
import MobileBlockEditor from './MobileBlockEditor';
import MobilePublishSheet, { publicationState } from './MobilePublishSheet';
import MobilePreview from './MobilePreview';
import QuickEditStatus from './QuickEditStatus';

interface MobileEditorProps {
  pageId: string;
  /** Save now (the retry button); the save controller also retries by itself (QA-008) */
  onSave: () => Promise<boolean>;
  onPublish: () => Promise<boolean>;
  onUnpublish?: () => Promise<boolean>;
  /** Why the last publish or unpublish failed at the server */
  publicationError?: () => unknown;
}

/** A toast with a button, added straight to the store's list (addToast takes no action). */
function addToastWithAction(message: string, action: NonNullable<ToastData['action']>) {
  const id = `undo-${Math.random().toString(36).slice(2, 9)}`;
  useEditorStore.setState((s) => ({ toasts: [...s.toasts, { id, message, variant: 'success', action }] }));
}

export default function MobileEditor({ onSave, onPublish, onUnpublish, publicationError }: MobileEditorProps) {
  const t = useTranslations();
  const locale = useLocale();
  const page = useEditorStore((s) => s.page);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const blockLocks = useEditorStore((s) => s.blockLocks);
  const myConnectionId = useEditorStore((s) => s.myConnectionId);
  const myUserId = useEditorStore((s) => s.myUserId);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const duplicateBlock = useEditorStore((s) => s.duplicateBlock);
  const requestDeleteBlock = useEditorStore((s) => s.requestDeleteBlock);
  const isDeleteConfirmOpen = useEditorStore((s) => s.pendingDeleteBlockId !== null);
  const cancelDeleteBlock = useEditorStore((s) => s.cancelDeleteBlock);
  const moveBlockUp = useEditorStore((s) => s.moveBlockUp);
  const moveBlockDown = useEditorStore((s) => s.moveBlockDown);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const addBlock = useEditorStore((s) => s.addBlock);
  const setPageWithHistory = useEditorStore((s) => s.setPageWithHistory);
  const { issue, text: issueText } = useSaveIssueText();
  const leave = useLeaveEditor('/dashboard');
  // The phone's back button answers the delete question instead of leaving the editor (MOBILE2-007)
  useCloseOnBack(isDeleteConfirmOpen, cancelDeleteBlock);

  // --- Sheet state ---
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showPublishSheet, setShowPublishSheet] = useState(false);
  const [isPreview, setIsPreview] = useState(false);

  // --- Long press preview ---
  const [previewBlockId, setPreviewBlockId] = useState<string | null>(null);

  // --- Editable page name ---
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(page.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // --- Touch reorder (QA-071) ---
  const scrollRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reorderBlocks = useCallback((from: number, to: number) => {
    useEditorStore.getState().reorderBlocks(from, to);
  }, []);
  const { dragIndex, dropIndex, dragOffset, onHandleTouchStart, onTouchMove, onTouchEnd } = useTouchReorder({
    scrollRef,
    listRef,
    onReorder: reorderBlocks,
  });
  const dragHandleProps = useMemo(() => ({ onTouchStart: onHandleTouchStart }), [onHandleTouchStart]);

  // --- Animation state for new blocks ---
  const [animatingBlockId, setAnimatingBlockId] = useState<string | null>(null);

  // --- Focus name input when editing starts ---
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // The sheet edits the selected block: it closes when the selection goes
  // (someone else won the block's lock, or it was deleted elsewhere) (QA-073)
  useEffect(() => useEditorStore.subscribe(
    (s) => s.selectedBlockId,
    (selected) => setEditingBlockId((editing) => (editing !== null && editing !== selected ? null : editing)),
  ), []);
  const sheetBlockId = editingBlockId !== null
    && selectedBlockId === editingBlockId
    && page.blocks.some((b) => b.id === editingBlockId)
    ? editingBlockId
    : null;

  // --- Block actions ---
  /** Open a block's sheet, unless another person has the block (the store refuses and they are told) */
  const openBlock = useCallback((blockId: string) => {
    if (!selectBlock(blockId)) return;
    setEditingBlockId(blockId);
  }, [selectBlock]);

  const handleLongPress = useCallback((blockId: string) => {
    setPreviewBlockId((prev) => (prev === blockId ? null : blockId));
  }, []);

  const handleCloseEditor = useCallback(() => {
    setEditingBlockId(null);
    // Let go of the block so others can edit it
    selectBlock(null);
  }, [selectBlock]);

  const handleDuplicate = useCallback((blockId: string) => {
    duplicateBlock(blockId);
    const store = useEditorStore.getState();
    const copyId = store.selectedBlockId !== blockId ? store.selectedBlockId : null;
    // Duplicating selects the copy; in Quick Edit nothing stays selected without its sheet
    selectBlock(null);
    if (!copyId) return;
    setAnimatingBlockId(copyId);
    setTimeout(() => setAnimatingBlockId(null), 400);
    // A swipe duplicates at once: the toast can take it back (QA-070)
    addToastWithAction(t('mobile.blockDuplicated'), {
      label: t('mobile.undo'),
      onClick: () => {
        if (useEditorStore.getState().page.blocks.some((b) => b.id === copyId)) {
          useEditorStore.getState().deleteBlock(copyId);
        }
      },
    });
  }, [duplicateBlock, selectBlock, t]);

  const handleDelete = useCallback((blockId: string) => {
    requestDeleteBlock(blockId);
  }, [requestDeleteBlock]);

  // --- Add block with scroll ---
  const handleAddBlock = useCallback((type: BlockType) => {
    const def = blockRegistry[type];
    const translatedLabel = getTranslatedBlockLabel(type, t, def.label);
    addBlock(type, translatedLabel, null, getBlockDefaults(type, locale));
    setShowAddSheet(false);

    setTimeout(() => {
      const blocks = useEditorStore.getState().page.blocks;
      const newBlock = blocks[blocks.length - 1];
      if (!newBlock) return;
      setAnimatingBlockId(newBlock.id);
      setTimeout(() => setAnimatingBlockId(null), 400);
      const items = listRef.current?.querySelectorAll('[role="listitem"]');
      items?.[items.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      openBlock(newBlock.id);
    }, 50);
  }, [addBlock, openBlock, t, locale]);

  // --- Name editing ---
  const handleNameTap = useCallback(() => {
    setNameValue(page.name);
    setIsEditingName(true);
  }, [page.name]);

  const handleNameSubmit = useCallback(() => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== page.name) {
      setPageWithHistory((prev) => ({ ...prev, name: trimmed }));
    } else {
      setNameValue(page.name);
    }
    setIsEditingName(false);
  }, [nameValue, page.name, setPageWithHistory]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleNameSubmit();
    if (e.key === 'Escape') {
      setNameValue(page.name);
      setIsEditingName(false);
    }
  }, [handleNameSubmit, page.name]);

  // --- Save problems: retry now, or go to the refused field ---
  const handleIssueAction = useCallback(() => {
    if (!issue) return;
    if (issue.kind === 'failed') {
      void onSave();
      return;
    }
    const field = issue.fields[0];
    if (field.blockId) openBlock(field.blockId);
    else if (field.path[0] === 'name') handleNameTap();
  }, [handleNameTap, issue, onSave, openBlock]);

  const closeAddSheet = useCallback(() => setShowAddSheet(false), []);
  const closePublishSheet = useCallback(() => setShowPublishSheet(false), []);
  const closePreview = useCallback(() => setIsPreview(false), []);

  const availableBlocks = useMemo(() => getAvailableBlocks().map((block) => ({
    ...block,
    label: getTranslatedBlockLabel(block.type, t, block.label),
  })), [t]);

  // --- Preview mode ---
  if (isPreview) {
    return <MobilePreview page={page} onBack={closePreview} />;
  }

  const editingBlock = page.blocks.find((b) => b.id === sheetBlockId);
  const publication = publicationState(page.status, page.hasUnpublishedChanges);
  const anySheetOpen = sheetBlockId !== null || showAddSheet || showPublishSheet;
  // While a block is carried, the buttons that float at the bottom would hide where it lands (MOBILE2-008)
  const hideFloatingButtons = anySheetOpen || dragIndex !== null;
  const issueActionLabel = issue?.kind === 'failed'
    ? t('saveStatus.retryNow')
    : issue?.kind === 'rejected' && (issue.fields[0].blockId || issue.fields[0].path[0] === 'name')
      ? t('saveStatus.showField')
      : null;
  const lockedByName = (blockId: string): string | null => {
    const holder = lockHeldByOther({ blockLocks, myConnectionId }, blockId);
    if (!holder) return null;
    return holder.userId === myUserId ? t('collab.yourOtherTab') : holder.username;
  };

  return (
    <div className="flex flex-col h-dvh bg-surface text-primary">
      <GuestBanner compact />
      <AccessRevokedBanner />
      {/* --- Toolbar --- */}
      <header className="flex items-center gap-1 px-2 h-16 bg-surface-card/80 backdrop-blur-2xl border-b border-default/15 shrink-0 z-30">
        <a
          href="/dashboard"
          onClick={leave.onLinkClick}
          aria-busy={leave.isLeaving || undefined}
          className="flex items-center justify-center text-secondary active:text-primary min-w-11 min-h-11 rounded-lg shrink-0"
          aria-label={t('common.backToDashboard')}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </a>

        {/* Page name (editable, as wide as there is room for, QA-126) + status line */}
        <div className="flex flex-col items-stretch justify-center min-w-0 flex-1">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={handleNameKeyDown}
              maxLength={PAGE_FIELD_LIMITS.name}
              enterKeyHint="done"
              className="w-full text-base font-medium text-primary bg-surface-elevated border border-default/30 rounded-lg px-3 min-h-11 outline-none focus:border-primary/50 text-center"
              aria-label={t('mobile.pageName')}
            />
          ) : (
            <button
              type="button"
              onClick={handleNameTap}
              title={page.name}
              className="w-full text-sm font-semibold text-primary truncate px-2 min-h-11 leading-tight rounded-lg active:bg-surface-elevated transition-colors"
              aria-label={`${t('mobile.editPageName')}: ${page.name}`}
            >
              {page.name}
            </button>
          )}
          <div className="-mt-2.5">
            <QuickEditStatus />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsPreview(true)}
          className="flex items-center justify-center min-w-11 min-h-11 text-secondary active:text-primary rounded-lg shrink-0"
          aria-label={t('mobile.previewPage')}
        >
          <Eye size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setShowPublishSheet(true)}
          className={`relative flex items-center justify-center min-w-11 min-h-11 rounded-lg shrink-0 ${
            publication === 'live' ? 'text-success' : publication === 'changes' ? 'text-warning' : 'text-secondary active:text-primary'
          }`}
          aria-label={
            // Not the owner: the sheet only explains that publishing is the owner's, so the button does not promise it (EDITOR3-004)
            publication === 'live' ? t('mobile.publishedTitle')
              : page.isOwner === false ? t('mobile.publishingTitle')
              : publication === 'draft' ? t('mobile.publishTitle') : t('mobile.publishPendingAria')
          }
        >
          <Globe size={20} aria-hidden="true" />
          {/* Unpublished changes (QA-014) */}
          {publication === 'changes' && (
            <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-warning ring-2 ring-surface-card" aria-hidden="true" />
          )}
        </button>
      </header>

      {issue && issueText && (
        <div className="flex items-center gap-3 pl-4 pr-2 py-1 bg-error/10 border-b border-error/30 text-[13px] text-primary shrink-0">
          <AlertTriangle size={16} className="text-error shrink-0" aria-hidden="true" />
          <p className="flex-1 min-w-0">{issueText.full}</p>
          {issueActionLabel && (
            <button
              type="button"
              onClick={handleIssueAction}
              className="shrink-0 min-h-11 px-3 rounded-lg font-semibold text-primary-color active:opacity-70"
            >
              {issueActionLabel}
            </button>
          )}
        </div>
      )}

      {/* --- Block list --- */}
      <main
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 pt-4 pb-28"
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {page.blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-card border border-default/15 flex items-center justify-center">
              <Layers size={28} className="text-muted" aria-hidden="true" />
            </div>
            <div>
              <p className="text-lg font-semibold text-primary">{t('mobile.emptyTitle')}</p>
              <p className="text-sm text-secondary mt-1">
                {t('mobile.emptyDescription')}
              </p>
            </div>
          </div>
        ) : (
          <div ref={listRef} className="flex flex-col gap-2" role="list" aria-label={t('mobile.pageBlocks')}>
            {page.blocks.map((block, i) => {
              const isNew = animatingBlockId === block.id;
              return (
                <div
                  key={block.id}
                  className={isNew ? 'animate-slideIn' : ''}
                  // The carried card follows the finger (MOBILE2-008)
                  style={dragIndex === i ? {
                    transform: `translateY(${dragOffset}px) scale(1.02)`,
                    position: 'relative',
                    zIndex: 20,
                    boxShadow: '0 12px 28px rgb(0 0 0 / 0.35)',
                  } : undefined}
                >
                  {dragIndex !== null && dropIndex === i && dragIndex !== i && (
                    <div className="h-0.5 bg-primary rounded-full mx-4 mb-1" />
                  )}
                  <MobileBlockCard
                    block={block}
                    index={i}
                    isFirst={i === 0}
                    isLast={i === page.blocks.length - 1}
                    isPreviewExpanded={previewBlockId === block.id}
                    lockedBy={lockedByName(block.id)}
                    onTap={openBlock}
                    onLongPress={handleLongPress}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                    onMoveUp={moveBlockUp}
                    onMoveDown={moveBlockDown}
                    onDragHandleProps={dragHandleProps}
                  />
                </div>
              );
            })}
            {dragIndex !== null && dropIndex === page.blocks.length && (
              <div className="h-0.5 bg-primary rounded-full mx-4 mt-1" />
            )}
          </div>
        )}
        {/* What Quick Edit leaves to the full editor (D7) */}
        <p className="flex items-start gap-2 mt-6 px-1 text-xs text-secondary">
          <Info size={14} className="shrink-0 mt-px" aria-hidden="true" />
          {t('mobile.desktopOnlyNote')}
        </p>
      </main>

      {/* --- Undo / redo, within thumb reach (QA-067) --- */}
      {!hideFloatingButtons && (
        <div
          role="group"
          aria-label={t('mobile.history')}
          className="fixed left-6 bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] z-30 flex items-center rounded-full bg-surface-card border border-default/20 shadow-lg shadow-black/30"
        >
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            aria-label={t('mobile.undo')}
            className="min-w-12 min-h-12 flex items-center justify-center rounded-l-full text-primary disabled:text-muted disabled:opacity-60 active:bg-surface-elevated"
          >
            <Undo2 size={20} aria-hidden="true" />
          </button>
          <span className="w-px h-6 bg-default/40" aria-hidden="true" />
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            aria-label={t('mobile.redo')}
            className="min-w-12 min-h-12 flex items-center justify-center rounded-r-full text-primary disabled:text-muted disabled:opacity-60 active:bg-surface-elevated"
          >
            <Redo2 size={20} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* --- FAB: Add block --- */}
      {!hideFloatingButtons && (
        <button
          type="button"
          onClick={() => setShowAddSheet(true)}
          className="fixed right-6 bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] z-30 w-14 h-14 rounded-full flex items-center justify-center bg-primary shadow-lg shadow-black/30 active:scale-95 transition-transform"
          aria-label={t('mobile.addBlock')}
        >
          <Plus size={24} className="text-white" aria-hidden="true" />
        </button>
      )}

      {/* --- Bottom sheet: Block editor --- */}
      <MobileBottomSheet
        open={sheetBlockId !== null}
        onClose={handleCloseEditor}
        title={
          editingBlock
            ? t('mobile.editBlock', { name: getTranslatedBlockLabel(editingBlock.type, t, blockRegistry[editingBlock.type].label) })
            : undefined
        }
        ariaLabel={t('mobile.editBlockAria')}
        fullHeight
      >
        {sheetBlockId && <MobileBlockEditor blockId={sheetBlockId} />}
      </MobileBottomSheet>

      {/* --- Bottom sheet: Add block picker --- */}
      <MobileBottomSheet
        open={showAddSheet}
        onClose={closeAddSheet}
        title={t('mobile.addBlock')}
        ariaLabel={t('mobile.selectBlockType')}
        fullHeight={false}
        closeLabel={t('common.close')}
      >
        <div className="px-4 py-3 space-y-1">
          {availableBlocks.map((b) => {
            const BlockIcon = b.icon;
            return (
              <button
                type="button"
                key={b.type}
                onClick={() => handleAddBlock(b.type)}
                className="w-full flex items-center gap-4 px-4 py-3.5 min-h-11 rounded-xl active:bg-surface-card transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-surface-card border border-default/15 flex items-center justify-center shrink-0">
                  <BlockIcon size={18} className="text-primary-color" aria-hidden="true" />
                </div>
                <span className="text-sm font-medium text-primary">{b.label}</span>
              </button>
            );
          })}
        </div>
      </MobileBottomSheet>

      {/* --- Bottom sheet: Publish (QA-014) --- */}
      <MobilePublishSheet
        open={showPublishSheet}
        onClose={closePublishSheet}
        onPublish={onPublish}
        onUnpublish={onUnpublish}
        publicationError={publicationError}
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
    </div>
  );
}
