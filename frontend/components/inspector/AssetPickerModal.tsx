'use client';

import { useState, useCallback, useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import {
  X, UploadCloud, Image as ImageIcon, Check,
  FileImage, AlertCircle, Loader2, Trash2, Link2,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiAsset } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import { isAllowedImageUrl } from '@/lib/image-url';
import { useAssets } from '@/hooks/useAssets';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import GuestFeatureNotice from '@/components/guest/GuestFeatureNotice';
import { useGuestSession } from '@/components/guest/GuestSessionProvider';

interface AssetPickerModalProps {
  /** An image of the library was chosen */
  onSelect: (asset: ApiAsset) => void;
  onClose: () => void;
  /**
   * When given, the dialog also offers pasting the URL of an image hosted
   * elsewhere (QA-079); the URL is already checked against the server's rules.
   */
  onSelectUrl?: (url: string) => void;
}

/** What the server accepts (pages/views.py AssetViewSet): no SVG (QA-074). */
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ACCEPT = ALLOWED_TYPES.join(',');
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

type Source = 'library' | 'url';

/**
 * The media library as a modal dialog. Rendered into document.body, so no
 * ancestor with `backdrop-filter` or `transform` (the inspector) can trap its
 * fixed layout inside a column (QA-020). Keyboard: focus moves in, Tab stays
 * inside, Esc closes and focus returns to the button that opened it (QA-021).
 */
export default function AssetPickerModal({ onSelect, onClose, onSelectUrl }: AssetPickerModalProps) {
  const t = useTranslations();
  const locale = useLocale();
  const { isGuest } = useGuestSession();
  const { assets, isLoading, hasError: hasLoadError, error: loadFailure, updateAssets } = useAssets();
  const [source, setSource] = useState<Source>('library');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [actionError, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ApiAsset | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const loadError = hasLoadError ? apiErrorMessage(loadFailure, t, 'assets.loadError') : null;
  const error = actionError ?? loadError;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const deleteOriginRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const urlInputId = useId();
  const urlHintId = useId();

  useDialogFocus(dialogRef, true, onClose);

  // Everything behind the dialog is inert while it is open: Tab (WebKit skips
  // buttons, so the focus trap alone let it out) and screen readers stay inside (EDITOR2-006)
  useEffect(() => {
    let root: HTMLElement | null = dialogRef.current;
    while (root && root.parentElement !== document.body) root = root.parentElement;
    if (!root) return;
    const behind = Array.from(document.body.children).filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element !== root && !element.inert,
    );
    behind.forEach((element) => { element.inert = true; });
    return () => behind.forEach((element) => { element.inert = false; });
  }, []);

  const formatFileSize = useCallback((bytes: number) => {
    const decimalFormatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${decimalFormatter.format(bytes / 1024)} KB`;
    return `${decimalFormatter.format(bytes / (1024 * 1024))} MB`;
  }, [locale]);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Validate files before uploading
    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(t('assets.invalidType', { name: file.name }));
        return;
      }
      if (file.size > MAX_SIZE) {
        const sizeMb = new Intl.NumberFormat(locale, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(file.size / (1024 * 1024));
        setError(t('assets.fileTooLarge', { name: file.name, size: sizeMb }));
        return;
      }
      validFiles.push(file);
    }

    setIsUploading(true);
    setUploadProgress(0);
    setError(null);

    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => Math.min(prev + 10, 90));
    }, 200);

    try {
      for (const file of validFiles) {
        const asset = await api.assets.upload(file);
        updateAssets((prev) => [asset, ...prev]);
      }
      setUploadProgress(100);
    } catch (e) {
      // The server's reason is in Spanish and in JSON: say it in the interface's words
      setError(apiErrorMessage(e, t, 'assets.uploadRejected'));
    } finally {
      clearInterval(progressInterval);
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 300);
    }
  }, [locale, t, updateAssets]);

  /** Deleting removes the file for good, also from pages that show it: ask first (QA-072). */
  const askDelete = (asset: ApiAsset, origin: HTMLElement) => {
    deleteOriginRef.current = origin;
    setPendingDelete(asset);
  };

  const cancelDelete = () => {
    setPendingDelete(null);
    deleteOriginRef.current?.focus();
  };

  const confirmDelete = async () => {
    const asset = pendingDelete;
    setPendingDelete(null);
    if (!asset) return;
    try {
      await api.assets.delete(asset.id);
      updateAssets((prev) => prev.filter((a) => a.id !== asset.id));
      if (selectedId === asset.id) setSelectedId(null);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, t, 'assets.deleteError'));
    }
    // The card is gone: keep focus inside the dialog
    dialogRef.current?.querySelector<HTMLElement>('[data-asset-option], [data-upload-zone]')?.focus();
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleUpload(e.dataTransfer.files);
  }, [handleUpload]);

  const selectedAsset = assets.find((a) => a.id === selectedId);
  const trimmedUrl = imageUrl.trim();
  const isUrlValid = isAllowedImageUrl(trimmedUrl);

  const handleConfirm = () => {
    if (source === 'url') {
      if (!onSelectUrl) return;
      if (!isUrlValid) {
        setUrlError(t('assets.urlInvalid'));
        return;
      }
      onSelectUrl(trimmedUrl);
      return;
    }
    if (selectedAsset) onSelect(selectedAsset);
  };

  const canConfirm = source === 'url' ? trimmedUrl !== '' : !!selectedId;

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="w-full max-w-3xl bg-surface border border-subtle/80 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 p-5 border-b border-subtle/80 bg-surface-elevated/20 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                <ImageIcon aria-hidden="true" className="w-4 h-4 text-primary-color" />
              </div>
              <div className="min-w-0">
                <h2 id={titleId} className="text-sm font-semibold text-primary tracking-wide">{t('assets.mediaLibrary')}</h2>
                <p className="text-[11px] text-muted">{t('assets.filesCount', { count: assets.length })}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="p-2 pointer-coarse:w-11 pointer-coarse:h-11 flex items-center justify-center text-muted hover:text-primary hover:bg-surface-card/50 rounded-lg transition-colors"
            >
              <X aria-hidden="true" className="w-4 h-4" />
            </button>
          </div>

          {/* Library or a pasted URL */}
          {onSelectUrl && (
            <div className="px-6 pt-4 shrink-0">
              <div role="group" aria-label={t('assets.sourceLabel')} className="inline-flex bg-surface-elevated/80 p-1 rounded-lg border border-default/10">
                {(['library', 'url'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={source === option}
                    onClick={() => setSource(option)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 pointer-coarse:min-h-11 rounded-md text-xs font-medium transition-colors ${
                      source === option
                        ? 'bg-surface-card text-primary shadow-sm'
                        : 'text-muted hover:text-secondary'
                    }`}
                  >
                    {option === 'library'
                      ? <ImageIcon aria-hidden="true" className="w-3.5 h-3.5" />
                      : <Link2 aria-hidden="true" className="w-3.5 h-3.5" />}
                    {t(option === 'library' ? 'assets.sourceLibrary' : 'assets.sourceUrl')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto flex flex-col relative">
            {source === 'url' ? (
              <div className="p-6 space-y-3">
                <label htmlFor={urlInputId} className="block text-sm font-medium text-primary">
                  {t('assets.urlLabel')}
                </label>
                <input
                  id={urlInputId}
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={imageUrl}
                  onChange={(e) => {
                    setImageUrl(e.target.value);
                    setUrlError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirm();
                    }
                  }}
                  placeholder="https://"
                  aria-describedby={urlHintId}
                  aria-invalid={urlError ? true : undefined}
                  className="w-full bg-surface-elevated border border-default/20 rounded-lg px-3 py-2 pointer-coarse:min-h-11 text-sm text-primary placeholder-muted outline-none focus:border-primary/60 font-mono"
                />
                <p id={urlHintId} className="text-xs text-muted">{urlError ?? t('assets.urlHint')}</p>
                {isUrlValid && (
                  <div className="aspect-video max-w-sm rounded-lg overflow-hidden border border-default/10 bg-surface-elevated">
                    {/* eslint-disable-next-line @next/next/no-img-element -- an arbitrary external URL, not a build-time image */}
                    <img src={trimmedUrl} alt={t('assets.urlPreview')} className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Upload zone */}
                <div className="p-6 shrink-0">
                  {isGuest ? (
                    <GuestFeatureNotice
                      title={t('guest.uploadTitle')}
                      description={t('guest.uploadBody')}
                      actionLabel={t('guest.claimAction')}
                    />
                  ) : (
                    <button
                      type="button"
                      data-upload-zone=""
                      onDrop={handleDrop}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full rounded-xl border-2 border-dashed border-subtle bg-surface-elevated/30 hover:bg-surface-elevated/80 hover:border-primary/50 transition-all flex flex-col items-center justify-center py-8 px-4 cursor-pointer group"
                    >
                      <span className="w-12 h-12 rounded-full bg-surface-card/50 group-hover:bg-primary/10 flex items-center justify-center mb-4 transition-colors">
                        <UploadCloud aria-hidden="true" className="w-6 h-6 text-secondary group-hover:text-primary-color transition-colors" />
                      </span>
                      <span className="block text-sm font-medium text-primary mb-1 group-hover:text-primary-color transition-colors">
                        {/* Nothing to drag a file from on a touch screen (MOBILE2-009) */}
                        <span className="pointer-coarse:hidden">{t('assets.uploadPrompt')}</span>
                        <span className="hidden pointer-coarse:inline">{t('assets.uploadPromptTouch')}</span>
                      </span>
                      <span className="text-xs text-muted flex items-center gap-1.5">
                        <AlertCircle aria-hidden="true" className="w-3 h-3" /> {t('assets.uploadHint')}
                      </span>
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT}
                    multiple
                    tabIndex={-1}
                    aria-hidden="true"
                    className="hidden"
                    onChange={(e) => {
                      void handleUpload(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </div>

                {error && (
                  <div role="alert" className="mx-6 mb-4 flex items-center gap-2 text-error text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                    <AlertCircle aria-hidden="true" className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}

                {/* Loading state */}
                {isLoading && (
                  <div className="flex-1 flex items-center justify-center py-16">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm text-muted">{t('assets.loading')}</span>
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {!isLoading && assets.length === 0 && !isUploading && (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center pb-20">
                    <div className="w-24 h-24 mb-6 rounded-full bg-gradient-to-tr from-surface-elevated to-surface-card flex items-center justify-center border border-subtle/50 shadow-inner">
                      <FileImage aria-hidden="true" className="w-10 h-10 text-muted" />
                    </div>
                    <h3 className="text-lg font-semibold text-primary mb-2">{t('assets.emptyTitle')}</h3>
                    <p className="text-sm text-muted max-w-xs mb-8 leading-relaxed">
                      {t('assets.emptyDescription')}
                    </p>
                    {!isGuest && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-surface-elevated text-primary hover:bg-surface-card px-6 py-2.5 pointer-coarse:min-h-11 rounded-full text-sm font-semibold transition-all active:scale-95 shadow-lg shadow-white/5"
                      >
                        {t('assets.uploadFirst')}
                      </button>
                    )}
                  </div>
                )}

                {/* Thumbnails grid */}
                {!isLoading && (assets.length > 0 || isUploading) && (
                  <ul aria-label={t('assets.mediaLibrary')} className="grid grid-cols-2 md:grid-cols-3 gap-4 px-6 pb-6 auto-rows-max">
                    {/* Uploading card */}
                    {isUploading && (
                      <li className="relative aspect-square rounded-xl overflow-hidden border border-subtle bg-surface-elevated flex flex-col items-center justify-center">
                        <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-purple-900/20 animate-pulse" />
                        <Loader2 aria-hidden="true" className="w-8 h-8 text-primary-color animate-spin mb-3 z-10" />
                        <span role="status" className="text-sm font-semibold text-primary-color z-10">
                          {t('assets.uploading', { progress: Math.min(uploadProgress, 100) })}
                        </span>
                        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-surface">
                          <div
                            className="h-full bg-primary transition-all duration-300 ease-out"
                            style={{ width: `${Math.min(uploadProgress, 100)}%` }}
                          />
                        </div>
                      </li>
                    )}

                    {/* Asset cards: the image is a toggle button, delete is its own button beside it */}
                    {assets.map((asset) => {
                      const isSelected = selectedId === asset.id;
                      return (
                        <li key={asset.id} className="group relative aspect-square">
                          <button
                            type="button"
                            data-asset-option=""
                            aria-pressed={isSelected}
                            aria-label={t('assets.imageOption', { name: asset.name, size: formatFileSize(asset.size) })}
                            onClick={() => setSelectedId(isSelected ? null : asset.id)}
                            onDoubleClick={() => onSelect(asset)}
                            className={`relative block w-full h-full rounded-xl overflow-hidden cursor-pointer transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                              isSelected
                                ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface scale-[0.98]'
                                : 'border border-subtle/80 hover:border-default hover:shadow-lg'
                            }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- user uploads served by the backend */}
                            <img
                              src={asset.url}
                              alt=""
                              className="w-full h-full object-cover"
                            />

                            {/* Selection mark */}
                            <span
                              aria-hidden="true"
                              className={`absolute top-3 right-3 w-6 h-6 rounded-full border flex items-center justify-center transition-all z-20 ${
                                isSelected
                                  ? 'bg-primary border-primary text-white shadow-md scale-100'
                                  : 'bg-black/20 border-white/30 text-transparent backdrop-blur-sm opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </span>

                            {/* Info overlay */}
                            <span
                              aria-hidden="true"
                              className={`absolute inset-x-0 bottom-0 p-3 pt-8 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-200 flex flex-col justify-end text-left ${
                                isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                              }`}
                            >
                              <span className="block text-[11px] font-medium text-white truncate drop-shadow-md pr-2">
                                {asset.name}
                              </span>
                              <span className="block text-[10px] text-white/80 font-mono mt-0.5">
                                {formatFileSize(asset.size)}
                              </span>
                            </span>
                          </button>

                          {/* Delete: visible on hover, keyboard focus and always on touch screens */}
                          <button
                            type="button"
                            onClick={(e) => askDelete(asset, e.currentTarget)}
                            aria-label={t('assets.deleteImage', { name: asset.name })}
                            title={t('common.delete')}
                            className="absolute top-3 left-3 w-6 h-6 pointer-coarse:w-11 pointer-coarse:h-11 pointer-coarse:top-1 pointer-coarse:left-1 rounded-full bg-black/50 border border-white/20 flex items-center justify-center text-white/80 hover:text-red-400 hover:bg-red-500/20 hover:border-red-500/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 transition-all z-20"
                          >
                            <Trash2 aria-hidden="true" className="w-3 h-3 pointer-coarse:w-4 pointer-coarse:h-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="p-5 border-t border-subtle/80 bg-surface flex items-center justify-between gap-3 shrink-0">
            <div className="text-[11px] text-muted truncate min-w-0">
              {source === 'url'
                ? (trimmedUrl || t('assets.noneSelected'))
                : (selectedAsset ? selectedAsset.name : t('assets.noneSelected'))}
            </div>
            <div className="flex gap-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 pointer-coarse:min-h-11 rounded-full text-sm font-medium text-secondary hover:text-primary hover:bg-surface-elevated transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canConfirm}
                className={`px-6 py-2 pointer-coarse:min-h-11 rounded-full text-sm font-semibold transition-all shadow-lg ${
                  canConfirm
                    ? 'bg-primary text-white hover:bg-primary/80 shadow-primary/20 active:scale-95'
                    : 'bg-surface-card text-muted cursor-not-allowed shadow-none'
                }`}
              >
                {t('assets.select')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('assets.deleteTitle')}
        message={t('assets.deleteMessage', { name: pendingDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
        variant="danger"
        onConfirm={() => { void confirmDelete(); }}
        onCancel={cancelDelete}
      />
    </>,
    document.body,
  );
}
