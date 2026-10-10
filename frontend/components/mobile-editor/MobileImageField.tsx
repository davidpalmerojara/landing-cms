'use client';

import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, Link2, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import AssetPickerModal from '@/components/inspector/AssetPickerModal';
import type { ApiAsset } from '@/lib/api';
import { useCloseOnBack } from '@/hooks/useCloseOnBack';

interface MobileImageFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: unknown) => void;
  /** Why the server refused the current value, already translated */
  error?: string;
}

/**
 * An image field on a phone (QA-063): pick one from the media library, where
 * "Subir" opens the phone's photo library or camera, or paste an address.
 */
export default function MobileImageField({ id, label, value, onChange, error }: MobileImageFieldProps) {
  const t = useTranslations();
  const [showPicker, setShowPicker] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const labelId = `${id}-label`;
  const urlId = `${id}-url`;
  const errorId = `${id}-error`;

  const closePicker = useCallback(() => setShowPicker(false), []);
  // Back closes the media library first, then the sheet
  useCloseOnBack(showPicker, closePicker);

  const handleSelect = (asset: ApiAsset) => {
    onChange(asset.url);
    setShowPicker(false);
  };

  return (
    <div className="space-y-2" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="block text-xs font-semibold text-secondary">{label}</span>

      {value && (
        <div className="w-full h-32 rounded-xl bg-surface-card border border-default/15 overflow-hidden">
          <img
            src={value}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          id={id}
          onClick={() => setShowPicker(true)}
          aria-describedby={error ? errorId : undefined}
          className="flex-1 min-h-11 flex items-center justify-center gap-2 rounded-xl border border-default/20 bg-surface-card text-sm font-medium text-primary active:bg-surface-elevated"
        >
          {value ? <RefreshCw size={16} aria-hidden="true" /> : <ImagePlus size={16} aria-hidden="true" />}
          {value ? t('mobile.changeImage') : t('mobile.chooseImage')}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={t('mobile.removeImage', { field: label })}
            className="shrink-0 min-w-11 min-h-11 flex items-center justify-center rounded-xl border border-error/30 text-error active:bg-error/10"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowUrl((open) => !open)}
        aria-expanded={showUrl}
        aria-controls={urlId}
        className="min-h-11 flex items-center gap-1.5 text-[13px] font-medium text-primary-color"
      >
        <Link2 size={14} aria-hidden="true" />
        {t('mobile.pasteImageUrl')}
      </button>
      {showUrl && (
        <input
          id={urlId}
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          aria-label={t('mobile.imageUrlLabel', { field: label })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="w-full px-4 py-3 rounded-xl bg-surface-card border border-default/15 text-primary text-base placeholder-muted focus:border-primary/50 focus:ring-1 focus:ring-primary/30 outline-none"
        />
      )}
      {error && <p id={errorId} className="text-xs text-error">{error}</p>}

      {/* At the end of <body>: above the sheet, and out of its scroll and stacking */}
      {showPicker && createPortal(
        <AssetPickerModal onSelect={handleSelect} onClose={closePicker} />,
        document.body,
      )}
    </div>
  );
}
