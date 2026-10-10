'use client';

import { useState } from 'react';
import { ImagePlus, Trash2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import AssetPickerModal from './AssetPickerModal';
import type { ApiAsset } from '@/lib/api';

interface ImageFieldProps {
  /** Id of the button that opens the picker; the field label points at it. */
  id: string;
  /** Id of the field's visible label, so the buttons announce which field they act on. */
  labelId?: string;
  value: string;
  onChange: (value: unknown) => void;
}

/** File name of an image URL, for announcing the current value. */
function imageName(url: string): string {
  return url.split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? url;
}

export default function ImageField({ id, labelId, value, onChange }: ImageFieldProps) {
  const t = useTranslations();
  const [showPicker, setShowPicker] = useState(false);
  const valueId = `${id}-value`;
  const removeId = `${id}-remove`;
  // Each button keeps its own action as its name and adds the field it belongs to
  const withFieldLabel = (ownId: string) => (labelId ? `${ownId} ${labelId}` : undefined);

  const handleSelect = (asset: ApiAsset) => {
    onChange(asset.url);
    setShowPicker(false);
  };

  const handleRemove = () => {
    onChange('');
  };

  return (
    <>
      <p id={valueId} className="sr-only">
        {value ? t('inspector.imageCurrent', { name: imageName(value) }) : t('inspector.imageNone')}
      </p>
      {value ? (
        <div className="space-y-2">
          <div className="relative aspect-video rounded-lg overflow-hidden border border-default/10 bg-surface-elevated">
            <img
              src={value}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              id={id}
              onClick={() => setShowPicker(true)}
              aria-labelledby={withFieldLabel(id)}
              aria-describedby={valueId}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-secondary hover:text-primary active:text-primary bg-surface-elevated/50 border border-default/10 rounded-md hover:bg-surface-card active:bg-surface-card transition-colors"
            >
              <RefreshCw aria-hidden="true" className="w-3 h-3" />
              {t('common.change')}
            </button>
            <button
              type="button"
              id={removeId}
              onClick={handleRemove}
              aria-label={t('inspector.removeImage')}
              aria-labelledby={withFieldLabel(removeId)}
              title={t('inspector.removeImage')}
              className="flex items-center justify-center gap-1.5 py-1.5 px-3 text-[11px] font-medium text-error bg-transparent border border-red-900/30 rounded-md hover:bg-red-500/10 hover:border-red-500/40 active:bg-red-500/10 active:border-red-500/40 transition-colors"
            >
              <Trash2 aria-hidden="true" className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          id={id}
          onClick={() => setShowPicker(true)}
          aria-labelledby={withFieldLabel(id)}
          aria-describedby={valueId}
          className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-lg border-2 border-dashed border-default/20 bg-surface-elevated/30 hover:bg-surface-elevated/80 hover:border-primary/50 active:bg-surface-elevated/80 active:border-primary/50 text-muted hover:text-primary-color active:text-primary-color transition-all cursor-pointer group"
        >
          <ImagePlus aria-hidden="true" className="w-5 h-5" />
          <span className="text-[11px] font-medium">{t('inspector.selectImage')}</span>
        </button>
      )}

      {showPicker && (
        <AssetPickerModal
          onSelect={handleSelect}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}
