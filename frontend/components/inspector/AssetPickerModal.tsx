'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  X, UploadCloud, Image as ImageIcon, Check,
  FileImage, AlertCircle, Loader2, Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiAsset } from '@/lib/api';

interface AssetPickerModalProps {
  onSelect: (asset: ApiAsset) => void;
  onClose: () => void;
}

export default function AssetPickerModal({ onSelect, onClose }: AssetPickerModalProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [assets, setAssets] = useState<ApiAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = useCallback((bytes: number) => {
    const decimalFormatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${decimalFormatter.format(bytes / 1024)} KB`;
    return `${decimalFormatter.format(bytes / (1024 * 1024))} MB`;
  }, [locale]);

  const loadAssets = useCallback(async () => {
    try {
      setError(null);
      const res = await api.assets.list();
      setAssets(res.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('assets.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

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
        setAssets((prev) => [asset, ...prev]);
      }
      setUploadProgress(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('assets.uploadError'));
    } finally {
      clearInterval(progressInterval);
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 300);
    }
  }, [locale, t]);

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.assets.delete(id);
      setAssets((prev) => prev.filter((a) => a.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('assets.deleteError'));
    }
  }, [selectedId, t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleUpload(e.dataTransfer.files);
  }, [handleUpload]);

  const handleConfirm = useCallback(() => {
    const asset = assets.find((a) => a.id === selectedId);
    if (asset) onSelect(asset);
  }, [assets, selectedId, onSelect]);

  const selectedAsset = assets.find((a) => a.id === selectedId);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-surface border border-subtle\/80 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-subtle\/80 bg-surface-elevated/20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary\/10 flex items-center justify-center border border-[#2563EB]/20">
              <ImageIcon className="w-4 h-4 text-[#2563EB]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-primary tracking-wide">{t('assets.mediaLibrary')}</h2>
              <p className="text-[11px] text-muted">{t('assets.filesCount', { count: assets.length })}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted hover:text-primary hover:bg-surface-card\/50 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto flex flex-col relative">
          {/* Upload zone */}
          <div className="p-6 shrink-0">
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-subtle bg-surface-elevated/30 hover:bg-surface-elevated\/80 hover:border-[#2563EB]/50 transition-all flex flex-col items-center justify-center py-8 cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-full bg-surface-card\/50 group-hover:bg-primary\/10 flex items-center justify-center mb-4 transition-colors">
                <UploadCloud className="w-6 h-6 text-secondary group-hover:text-[#2563EB] transition-colors" />
              </div>
              <p className="text-sm font-medium text-primary mb-1 group-hover:text-[#2563EB] transition-colors">
                {t('assets.uploadPrompt')}
              </p>
              <p className="text-xs text-muted flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" /> {t('assets.uploadHint')}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </div>

          {error && (
            <div className="mx-6 mb-4 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="flex-1 flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted">{t('assets.loading')}</span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && assets.length === 0 && !isUploading && (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center pb-20">
              <div className="w-24 h-24 mb-6 rounded-full bg-gradient-to-tr from-surface-elevated to-surface-card flex items-center justify-center border border-subtle\/50 shadow-inner">
                <FileImage className="w-10 h-10 text-muted" />
              </div>
              <h3 className="text-lg font-semibold text-primary mb-2">{t('assets.emptyTitle')}</h3>
              <p className="text-sm text-muted max-w-xs mb-8 leading-relaxed">
                {t('assets.emptyDescription')}
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-surface-elevated text-primary hover:bg-white px-6 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95 shadow-lg shadow-white/5"
              >
                {t('assets.uploadFirst')}
              </button>
            </div>
          )}

          {/* Thumbnails grid */}
          {!isLoading && (assets.length > 0 || isUploading) && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 px-6 pb-6 auto-rows-max">
              {/* Uploading card */}
              {isUploading && (
                <div className="relative aspect-square rounded-xl overflow-hidden border border-subtle bg-surface-elevated flex flex-col items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-tr from-[#2563EB]/20 to-purple-900/20 animate-pulse" />
                  <Loader2 className="w-8 h-8 text-[#2563EB] animate-spin mb-3 z-10" />
                  <span className="text-sm font-semibold text-[#2563EB] z-10">{Math.min(uploadProgress, 100)}%</span>
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-surface">
                    <div
                      className="h-full bg-primary transition-all duration-300 ease-out"
                      style={{ width: `${Math.min(uploadProgress, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Asset cards */}
              {assets.map((asset) => {
                const isSelected = selectedId === asset.id;
                return (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedId(isSelected ? null : asset.id)}
                    className={`group relative aspect-square rounded-xl overflow-hidden cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? 'ring-2 ring-[#2563EB] ring-offset-2 ring-offset-surface scale-[0.98]'
                        : 'border border-subtle\/80 hover:border-default hover:shadow-lg'
                    }`}
                  >
                    {/* Image */}
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />

                    {/* Selection checkbox */}
                    <div
                      className={`absolute top-3 right-3 w-6 h-6 rounded-full border flex items-center justify-center transition-all z-20 ${
                        isSelected
                          ? 'bg-primary border-[#2563EB] text-white shadow-md scale-100'
                          : 'bg-black/20 border-white/30 text-transparent backdrop-blur-sm opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDelete(asset.id, e)}
                      className="absolute top-3 left-3 w-6 h-6 rounded-full bg-black/40 border border-white/20 flex items-center justify-center text-white/70 hover:text-red-400 hover:bg-red-500/20 hover:border-red-500/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all z-20"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>

                    {/* Info overlay */}
                    <div
                      className={`absolute inset-x-0 bottom-0 p-3 pt-8 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-200 flex flex-col justify-end ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <p className="text-[11px] font-medium text-white truncate drop-shadow-md pr-2">
                        {asset.name}
                      </p>
                      <p className="text-[10px] text-secondary/80 font-mono mt-0.5">
                        {formatFileSize(asset.size)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-subtle\/80 bg-surface flex items-center justify-between shrink-0">
          <div className="text-[11px] text-muted truncate max-w-[200px]">
            {selectedAsset ? selectedAsset.name : t('assets.noneSelected')}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-full text-sm font-medium text-secondary hover:text-white hover:bg-surface-elevated transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedId}
              className={`px-6 py-2 rounded-full text-sm font-semibold transition-all shadow-lg ${
                selectedId
                  ? 'bg-primary text-white hover:bg-[#2563EB]/80 shadow-[#2563EB]/20 active:scale-95'
                  : 'bg-surface-card text-muted cursor-not-allowed shadow-none'
              }`}
            >
              {t('assets.select')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
